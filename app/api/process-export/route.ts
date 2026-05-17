// POST /api/process-export
//
// Downloads a .pp file from Supabase Storage, parses it with the pure
// TypeScript pp-reader (no Asta Toolkit required), and writes the result
// to the Supabase BI tables.  Called fire-and-forget from the upload route
// and also accepts direct POST calls for manual re-triggering.

import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { parsePpFile } from "@/lib/pp-reader";
import type { PpExportData } from "@/lib/pp-reader";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Fluid — up to 300 s

const bodySchema = z.object({
  job_id: z.string().uuid(),
  upload_id: z.string().uuid(),
  storage_bucket: z.string().min(1),
  storage_path: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { job_id, upload_id, storage_bucket, storage_path } = parsed.data;
  const supabase = createSupabaseAdminClient();

  // Atomically claim the job (only proceed if still pending)
  const { data: claimData, error: claimError } = await supabase
    .from("import_jobs")
    .update({
      status: "processing",
      locked_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      worker_name: "pp-reader-cloud",
    })
    .eq("id", job_id)
    .eq("status", "pending")
    .select("id")
    .single();

  if (claimError || !claimData) {
    // Job is already processing or completed — return 200 so caller doesn't retry
    return NextResponse.json({ skipped: true }, { status: 200 });
  }

  try {
    // Download the .pp file from Supabase Storage via a signed URL
    const { data: signData, error: signError } = await supabase.storage
      .from(storage_bucket)
      .createSignedUrl(storage_path, 600);

    if (signError || !signData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${signError?.message}`);
    }

    const fileRes = await fetch(signData.signedUrl);
    if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`);
    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

    // Parse the .pp file (SQLite or MDB — auto-detected)
    const exportData = await parsePpFile(fileBuffer);

    // Write BI data to Supabase tables
    await writeBiData(supabase, exportData);

    // Mark job completed
    await supabase
      .from("import_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        asta_result: { tables_written: countRows(exportData) },
        error_message: null,
      })
      .eq("id", job_id);

    return NextResponse.json({ success: true, rows: countRows(exportData) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("import_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("id", job_id);

    console.error(`[process-export] Job ${job_id} failed:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── BI table writer ──────────────────────────────────────────────────────────

function countRows(d: PpExportData): Record<string, number> {
  return {
    PlanningData: d.planningData.length,
    Project: d.projects.length,
    ProgressPeriod: d.progressPeriods.length,
    CodeLibrary: d.codeLibraries.length,
    CodeLibraryEntry: d.codeLibraryEntries.length,
    Expanded: d.expanded.length,
    Bar: d.bars.length,
    Milestone: d.milestones.length,
    TaskCompletedSection: d.taskCompletedSections.length,
    Task: d.tasks.length,
    AllAssignedCodes: d.allAssignedCodes.length,
    Bsln: d.bsln.length,
    Link: d.links.length,
    AllocationTimephased: d.allocationTimephased.length,
  };
}

type AnyRow = Record<string, unknown>;

async function upsertBatch(
  supabase: SupabaseClient,
  table: string,
  rows: AnyRow[],
  chunkSize = 500
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk);
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
  }
}

// Converts Date objects to ISO strings so Supabase JSON serialisation is clean.
function serializeRow(row: AnyRow): AnyRow {
  const out: AnyRow = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

async function writeBiData(supabase: SupabaseClient, d: PpExportData) {
  const ser = (rows: AnyRow[]) => rows.map(serializeRow);

  await upsertBatch(supabase, "PlanningData", ser(d.planningData as AnyRow[]));
  await upsertBatch(supabase, "Project", ser(d.projects as AnyRow[]));
  await upsertBatch(supabase, "ProgressPeriod", ser(d.progressPeriods as AnyRow[]));
  await upsertBatch(supabase, "CodeLibrary", ser(d.codeLibraries as AnyRow[]));
  await upsertBatch(supabase, "CodeLibraryEntry", ser(d.codeLibraryEntries as AnyRow[]));
  await upsertBatch(supabase, "Expanded", ser(d.expanded as AnyRow[]));
  await upsertBatch(supabase, "Bar", ser(d.bars as AnyRow[]));
  await upsertBatch(supabase, "Milestone", ser(d.milestones as AnyRow[]));
  await upsertBatch(supabase, "TaskCompletedSection", ser(d.taskCompletedSections as AnyRow[]));
  await upsertBatch(supabase, "Task", ser(d.tasks as AnyRow[]));
  await upsertBatch(supabase, "AllAssignedCodes", ser(d.allAssignedCodes as AnyRow[]));
  await upsertBatch(supabase, "Bsln", ser(d.bsln as AnyRow[]));
  await upsertBatch(supabase, "Link", ser(d.links as AnyRow[]));
  await upsertBatch(supabase, "AllocationTimephased", ser(d.allocationTimephased as AnyRow[]));
}
