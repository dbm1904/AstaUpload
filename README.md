# Asta PowerProject Upload

A Vercel-ready Next.js intake application backed by Supabase. Customers can submit an Asta PowerProject file plus project metadata; the app stores the upload in private Supabase Storage, creates an import job, and leaves the Asta Business Intelligence export to a Windows worker.

The Windows split is required because Asta PowerProject exposes BI export through COM/OLE automation (`Teamplan.Object` / `PerformBIExport`), which must run on a Windows host with the Developers' Toolkit installed rather than in Vercel's Linux serverless runtime.

## What is included

- `app/` — customer upload UI and upload API route.
- `supabase/migrations/20260517000000_create_uploads_and_asta_bi_schema.sql` — upload/job tables, private Storage bucket, job RPC helpers, and converted Asta BI tables.
- `worker/Invoke-AstaImportWorker.ps1` — polling worker that claims jobs, downloads uploads, invokes `PerformBIExport`, and writes completion/failure status back to Supabase.
- `docs/architecture.md` — deployment notes and end-to-end data flow.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Required Vercel/Supabase variables are listed in `.env.example`. Apply the Supabase migration before submitting uploads.

## Worker quick start

Run the worker on a Windows machine that has Asta PowerProject COM automation and the required ODBC driver installed:

```powershell
$env:SUPABASE_URL = "https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key"
$env:ASTA_BI_ODBC_CONNECTION_STRING = "Driver={PostgreSQL Unicode(x64)};Server=db.your-project.supabase.co;Port=5432;Database=postgres;Uid=postgres;Pwd=...;SSLmode=require;"
.\worker\Invoke-AstaImportWorker.ps1
```
