// Supabase Edge Function: trigger-export
//
// Called by the Next.js upload API after a new import_jobs row is created.
// Dispatches a GitHub Actions repository_dispatch event so the Windows
// self-hosted runner picks up the job and runs the Asta BI export.
//
// Required secrets (set via `supabase secrets set`):
//   GITHUB_DISPATCH_TOKEN  — fine-grained PAT with Actions: write on this repo
//   GITHUB_OWNER           — GitHub user / org that owns the repo
//   GITHUB_REPO            — repository name (e.g. AstaUpload)
//   SUPABASE_SERVICE_ROLE_KEY — used to authenticate inbound requests

interface TriggerPayload {
  job_id: string;
  upload_id: string;
  storage_bucket: string;
  storage_path: string;
  original_file_name: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Authenticate the caller with the Supabase service role key so only the
  // server-side Next.js route (or another trusted service) can trigger exports.
  const expectedToken = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const githubToken = Deno.env.get("GITHUB_DISPATCH_TOKEN");
  const githubOwner = Deno.env.get("GITHUB_OWNER");
  const githubRepo  = Deno.env.get("GITHUB_REPO");

  if (!githubToken || !githubOwner || !githubRepo) {
    return new Response(
      JSON.stringify({ error: "GitHub dispatch secrets are not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  let payload: TriggerPayload;
  try {
    payload = await req.json() as TriggerPayload;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { job_id, upload_id, storage_bucket, storage_path, original_file_name } = payload;
  if (!job_id || !upload_id || !storage_bucket || !storage_path || !original_file_name) {
    return new Response(
      JSON.stringify({ error: "Missing required payload fields" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${githubOwner}/${githubRepo}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "asta-bi-export",
        client_payload: { job_id, upload_id, storage_bucket, storage_path, original_file_name },
      }),
    }
  );

  // GitHub returns 204 No Content on success
  if (dispatchRes.status !== 204 && !dispatchRes.ok) {
    const detail = await dispatchRes.text();
    return new Response(
      JSON.stringify({ error: "GitHub dispatch failed", detail }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ dispatched: true, job_id }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
