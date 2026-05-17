# Asta PowerProject upload and BI export architecture

## Runtime split

The Vercel application handles customer-facing upload and metadata capture. The Asta BI export itself is deliberately executed by a separate Windows worker because Elecosoft documents the export as COM/OLE automation through the Developers' Toolkit `PerformBIExport` method. Vercel serverless functions run on Linux and cannot host that COM object.

## Flow

1. Customer submits the upload form in the Next.js app.
2. `POST /api/uploads` validates metadata, stores the PowerProject file in the private Supabase Storage bucket, inserts a `project_uploads` row, and creates a pending `import_jobs` row.
3. `worker/Invoke-AstaImportWorker.ps1` runs on a Windows machine with PowerProject automation installed.
4. The worker atomically claims the next pending job with `claim_next_import_job`, downloads the private file through a short-lived signed URL, opens it using `Teamplan.Object`, and calls `PerformBIExport` with an ODBC connection string.
5. Export results or errors are written back to `import_jobs`.

## Supabase setup

Apply `supabase/migrations/20260517000000_create_uploads_and_asta_bi_schema.sql` to create:

- `project_uploads` for customer metadata and storage object references.
- `import_jobs` for worker status, attempts, BI export results, and errors.
- Private Storage bucket `asta-powerproject-uploads`.
- Converted Asta BI tables from the SQL Server schema already present in the repository.
- RPC helpers for atomically claiming and completing jobs.

## Required environment variables

### Vercel

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_UPLOAD_BUCKET=asta-powerproject-uploads
MAX_UPLOAD_BYTES=52428800
```

### Windows worker

```powershell
$env:SUPABASE_URL = "https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key"
$env:ASTA_BI_ODBC_CONNECTION_STRING = "Driver={PostgreSQL Unicode(x64)};Server=db.your-project.supabase.co;Port=5432;Database=postgres;Uid=postgres;Pwd=...;SSLmode=require;"
.\worker\Invoke-AstaImportWorker.ps1
```

Use a database user with permissions to insert into the converted BI tables. For production, prefer a constrained database role over the project owner once the exact ODBC permissions are confirmed.

## Notes

- The worker defaults `wipe` to `None` to avoid one customer's export deleting another customer's BI data. If the BI export requires `All` or `PlanningData`, isolate each import by database/schema or run post-processing into tenant-scoped tables.
- The converted BI table names and columns are quoted to preserve the PascalCase identifiers expected by many ODBC clients.
- The migration enables row-level security on app tables; the server route and worker use the Supabase service role key, which bypasses RLS.
