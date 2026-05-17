import Link from "next/link";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <span className="eyebrow">Vercel + Supabase intake</span>
        <h1>Collect Asta PowerProject files and queue BI exports automatically.</h1>
        <p>
          Customers upload a PowerProject file with project metadata. Vercel stores the file in Supabase,
          creates an import job, and a Windows worker with the Asta Developers&apos; Toolkit performs the COM/OLE
          Business Intelligence export into the Supabase schema.
        </p>
        <div>
          <Link href="/uploads/new"><button>Upload a project file</button></Link>
        </div>
      </section>
      <section className="grid">
        <div className="card">
          <h2>Why there is a worker</h2>
          <p>
            Elecosoft exposes BI export through a COM/OLE method named <code>PerformBIExport</code>. That runs on
            Windows with PowerProject / the Developers&apos; Toolkit installed, so it cannot execute inside Vercel&apos;s
            Linux serverless runtime. This app queues work for a Windows runner instead.
          </p>
        </div>
        <div className="card">
          <h2>Pipeline</h2>
          <ul>
            <li>Upload <code>.pp</code> / <code>.ppx</code> file to private Supabase Storage.</li>
            <li>Persist customer and project metadata in <code>project_uploads</code>.</li>
            <li>Create a pending <code>import_jobs</code> record.</li>
            <li>Windows worker downloads the file and calls Asta BI export via ODBC.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
