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

type SerializedRow = Record<string, unknown>;

function serializeRow(row: object): SerializedRow {
  const out: SerializedRow = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

async function upsertBatch(
  supabase: SupabaseClient,
  table: string,
  rows: object[],
  chunkSize = 500
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map(serializeRow);
    const { error } = await supabase.from(table).upsert(chunk);
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
  }
}

async function writeBiData(supabase: SupabaseClient, d: PpExportData) {
  await upsertBatch(supabase, "PlanningData", d.planningData);
  await upsertBatch(supabase, "Project", d.projects);
  await upsertBatch(supabase, "ProgressPeriod", d.progressPeriods);
  await upsertBatch(supabase, "CodeLibrary", d.codeLibraries);
  await upsertBatch(supabase, "CodeLibraryEntry", d.codeLibraryEntries);
  await upsertBatch(supabase, "Expanded", d.expanded);
  await upsertBatch(supabase, "Bar", d.bars);
  await upsertBatch(supabase, "Milestone", d.milestones);
  await upsertBatch(supabase, "TaskCompletedSection", d.taskCompletedSections);
  await upsertBatch(supabase, "Task", d.tasks);
  await upsertBatch(supabase, "AllAssignedCodes", d.allAssignedCodes);
  await upsertBatch(supabase, "Bsln", d.bsln);
  await upsertBatch(supabase, "Link", d.links);
  await upsertBatch(supabase, "AllocationTimephased", d.allocationTimephased);
}
