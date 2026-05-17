# Asta PowerProject upload and BI export architecture

## Runtime split

Elecosoft documents the BI export as COM/OLE automation through the
Developers' Toolkit `PerformBIExport` method (`Teamplan.Object`).  That COM
object can only run on a Windows host with PowerProject installed; it cannot
run in Vercel's Linux serverless runtime or in a standard Linux container.

The solution is a **GitHub Actions cloud workflow** that targets a
self-hosted Windows runner.  The runner lives on any Windows machine (cloud
VM, on-premises server, etc.) with the Asta Developers' Toolkit installed and
GitHub Actions runner software registered.

## End-to-end flow

```
Customer browser
    │  POST /api/uploads (multipart form)
    ▼
Next.js on Vercel
    1. Validate metadata and file
    2. Upload .pp to private Supabase Storage bucket
    3. Insert project_uploads row
    4. Insert import_jobs row (status = pending)  ← get job UUID back
    5. POST /functions/v1/trigger-export (fire-and-forget)
    │
    ▼
Supabase Edge Function  (trigger-export)
    • Authenticates caller with service role key
    • POST https://api.github.com/repos/{owner}/{repo}/dispatches
      event_type: asta-bi-export
      client_payload: { job_id, upload_id, storage_bucket,
                        storage_path, original_file_name }
    │
    ▼
GitHub Actions  (.github/workflows/asta-bi-export.yml)
    runs-on: [self-hosted, windows, asta]
    1. Resolve parameters (repository_dispatch or workflow_dispatch)
    2. Get signed URL for the .pp file; download to RUNNER_TEMP
    3. New-Object -ComObject Teamplan.Object
       OpenLocalProject → PerformBIExport (ODBC → Supabase Postgres)
    4. POST /rest/v1/rpc/complete_import_job  (or fail_import_job)
    5. Clean up temp file
    │
    ▼
Supabase Postgres
    BI tables: PlanningData, Project, Task, Bar, Milestone, …
    import_jobs.status updated to completed / failed
    │
    ▼
Success page polls GET /api/jobs/{uploadId} every 5 s
    → shows live status badge (Queued → Exporting → Complete / Failed)
```

## Reverse-engineered BIController.exe

`BIController.exe` (checked in at the repo root) is a .NET WinForms GUI that
wraps the same COM export path.  String analysis confirms:

* It creates `Teamplan.Object` via `GetTypeFromProgID` (COM interop).
* `PerformBIExport` is called with a JSON parameter block that includes
  `dataconnectiontype`, `wipe`, `parallel`, and `connection_string`.
* A `BatchRun` code path reads `GetCommandLineArgs`, enabling headless use.
* It supports two connection modes: DSN (`connTypeDSN`) and full ODBC
  connection string (`connTypeCS`).
* Without the Developers' Toolkit installed it aborts with
  *"Could not open APP OCX: the Developers' Toolkit must be installed"*.

The GitHub Actions workflow uses PowerShell COM automation directly
(the same approach as `worker/Invoke-AstaImportWorker.ps1`) rather than
invoking `BIController.exe`, because the PowerShell path has a known-good
JSON parameter interface and does not require a GUI session.

## Supabase setup

Apply `supabase/migrations/20260517000000_create_uploads_and_asta_bi_schema.sql`:

* `project_uploads` — customer metadata and storage references.
* `import_jobs` — job lifecycle, worker name, result, error.
* Private Storage bucket `asta-powerproject-uploads`.
* Asta BI tables (PlanningData, Project, Task, Bar, Milestone, …).
* RPC helpers `claim_next_import_job`, `complete_import_job`, `fail_import_job`.

## Required secrets and variables

### Vercel environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_UPLOAD_BUCKET=asta-powerproject-uploads
MAX_UPLOAD_BYTES=52428800
```

### Supabase Edge Function secrets

```bash
supabase secrets set GITHUB_DISPATCH_TOKEN=github_pat_...
supabase secrets set GITHUB_OWNER=your-github-user-or-org
supabase secrets set GITHUB_REPO=AstaUpload
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`GITHUB_DISPATCH_TOKEN` must be a fine-grained PAT (or classic PAT) with
**Actions: write** (`repo` scope for classic) on this repository.

### GitHub Actions repository secrets

| Secret | Value |
|--------|-------|
| `SUPABASE_URL` | `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key |
| `ASTA_BI_ODBC_CONNECTION_STRING` | Full ODBC connection string to Supabase Postgres |

### GitHub Actions repository variables (optional)

| Variable | Default | Purpose |
|----------|---------|---------|
| `ASTA_USER` | `Admin` | Asta login username |
| `ASTA_WIPE` | `None` | BI export wipe mode (`None`, `All`, or `PlanningData`) |

## Registering the self-hosted Windows runner

1. In GitHub → repo → Settings → Actions → Runners, add a new self-hosted runner.
2. Follow the Windows setup steps; ensure the machine has:
   * Asta PowerProject with the Developers' Toolkit installed.
   * PostgreSQL ODBC driver (e.g. `PostgreSQL Unicode(x64)`) that can reach the Supabase `db.*` host.
3. Add the runner labels `windows` and `asta`.
4. Start the runner service (`./run.cmd` or install as a Windows service).

## Deploying the Edge Function

```bash
supabase functions deploy trigger-export
```

The function is invoked automatically by the upload API.  For manual
re-triggering (e.g. after a transient failure) you can also call it directly:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/trigger-export" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"job_id":"...","upload_id":"...","storage_bucket":"asta-powerproject-uploads","storage_path":"...","original_file_name":"project.pp"}'
```

## Wipe mode note

`ASTA_WIPE` defaults to `None` so one customer's export does not delete
another's BI data.  If you need `All` or `PlanningData`, isolate tenants
by database/schema or run post-processing into tenant-scoped tables.
