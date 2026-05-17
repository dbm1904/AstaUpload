import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

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

  const { error: jobError } = await supabase.from("import_jobs").insert({
    upload_id: uploadId,
    status: "pending"
  });

  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL(`/uploads/success?id=${uploadId}`, request.url), { status: 303 });
}
