import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  const { uploadId } = await params;
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("import_jobs")
    .select("id, status, attempts, worker_name, error_message, created_at, updated_at, completed_at")
    .eq("upload_id", uploadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data);
}
