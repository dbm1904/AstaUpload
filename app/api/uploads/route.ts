import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { parsePpFile } from "@/lib/pp-reader";
import type { PpExportData } from "@/lib/pp-reader";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Fluid — keep alive for background export

const metadataSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerEmail: z.string().trim().email().max(320),
  projectName: z.string().trim().min(1).max(240),
  projectReference: z.string().trim().max(120).optional().default(""),
  projectSummary: z.string().trim().max(4000).optional().default("")
});

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

export async function POST(request: Request) {
  const env = getServerEnv();
  const formData = await request.formData();
  const parsed = metadataSchema.safeParse({
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    projectName: formData.get("projectName"),
    projectReference: formData.get("projectReference") ?? "",
    projectSummary: formData.get("projectSummary") ?? ""
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload metadata", details: parsed.error.flatten() }, { status: 400 });
  }

  const file = formData.get("powerprojectFile");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A PowerProject file is required" }, { status: 400 });
  }

  if (file.size > env.MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File exceeds ${env.MAX_UPLOAD_BYTES} bytes` }, { status: 413 });
  }

  const uploadId = randomUUID();
  const storagePath = `${uploadId}/${sanitizeFileName(file.name)}`;
  const supabase = createSupabaseAdminClient();
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: storageError } = await supabase.storage
    .from(env.SUPABASE_UPLOAD_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 });
  }

  const { error: uploadError } = await supabase.from("project_uploads").insert({
    id: uploadId,
    customer_name: parsed.data.customerName,
    customer_email: parsed.data.customerEmail,
    project_name: parsed.data.projectName,
    project_reference: parsed.data.projectReference || null,
    project_summary: parsed.data.projectSummary || null,
    original_file_name: file.name,
    storage_bucket: env.SUPABASE_UPLOAD_BUCKET,
    storage_path: storagePath,
    file_size_bytes: file.size,
    content_type: file.type || null
  });

  if (uploadError) {
    await supabase.storage.from(env.SUPABASE_UPLOAD_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: jobData, error: jobError } = await supabase
    .from("import_jobs")
    .insert({ upload_id: uploadId, status: "pending" })
    .select("id")
    .single();

  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 });
  }

  // Run the .pp parse + BI write after sending the redirect response.
  // next/server after() keeps the serverless function alive until done.
  const jobId = jobData.id;
  const bucket = env.SUPABASE_UPLOAD_BUCKET;

  after(async () => {
    const sb = createSupabaseAdminClient();
    try {
      await sb.from("import_jobs")
        .update({
          status: "processing",
          locked_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          worker_name: "pp-reader-cloud",
        })
        .eq("id", jobId)
        .eq("status", "pending");

      const { data: signData } = await sb.storage.from(bucket).createSignedUrl(storagePath, 600);
      const fileRes = await fetch(signData!.signedUrl);
      const ppBuffer = Buffer.from(await fileRes.arrayBuffer());

      const exportData = await parsePpFile(ppBuffer);
      await writeExportData(sb, exportData);

      await sb.from("import_jobs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        asta_result: {
          tables_written: Object.fromEntries(
            Object.entries(exportData).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
          ),
        },
        error_message: null,
      }).eq("id", jobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await sb.from("import_jobs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: message,
      }).eq("id", jobId);
      console.error(`[pp-export] Job ${jobId} failed:`, message);
    }
  });

  return NextResponse.redirect(new URL(`/uploads/success?id=${uploadId}`, request.url), { status: 303 });
}

// ── BI write helpers ──────────────────────────────────────────────────────────

type AnyRow = Record<string, unknown>;

function serRow(row: AnyRow): AnyRow {
  const out: AnyRow = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

async function upsertChunked(sb: SupabaseClient, table: string, rows: AnyRow[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 500).map(serRow));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export async function writeExportData(sb: SupabaseClient, d: PpExportData) {
  await upsertChunked(sb, "PlanningData", d.planningData as AnyRow[]);
  await upsertChunked(sb, "Project", d.projects as AnyRow[]);
  await upsertChunked(sb, "ProgressPeriod", d.progressPeriods as AnyRow[]);
  await upsertChunked(sb, "CodeLibrary", d.codeLibraries as AnyRow[]);
  await upsertChunked(sb, "CodeLibraryEntry", d.codeLibraryEntries as AnyRow[]);
  await upsertChunked(sb, "Expanded", d.expanded as AnyRow[]);
  await upsertChunked(sb, "Bar", d.bars as AnyRow[]);
  await upsertChunked(sb, "Milestone", d.milestones as AnyRow[]);
  await upsertChunked(sb, "TaskCompletedSection", d.taskCompletedSections as AnyRow[]);
  await upsertChunked(sb, "Task", d.tasks as AnyRow[]);
  await upsertChunked(sb, "AllAssignedCodes", d.allAssignedCodes as AnyRow[]);
  await upsertChunked(sb, "Bsln", d.bsln as AnyRow[]);
  await upsertChunked(sb, "Link", d.links as AnyRow[]);
  await upsertChunked(sb, "AllocationTimephased", d.allocationTimephased as AnyRow[]);
}
