export default function NewUploadPage() {
  return (
    <main>
      <section className="hero">
        <span className="eyebrow">New upload</span>
        <h1>Submit a PowerProject file</h1>
        <p>Include enough context for the project team to identify the schedule after import.</p>
      </section>
      <section className="grid">
        <form className="card form-grid" action="/api/uploads" method="post" encType="multipart/form-data">
          <label>
            Customer name
            <input name="customerName" required placeholder="Acme Construction" />
          </label>
          <label>
            Customer email
            <input name="customerEmail" required type="email" placeholder="planner@example.com" />
          </label>
          <label>
            Project name
            <input name="projectName" required placeholder="Hospital Expansion Phase 2" />
          </label>
          <label>
            Project reference
            <input name="projectReference" placeholder="Optional internal reference" />
          </label>
          <label>
            High-level project information
            <textarea name="projectSummary" placeholder="Scope, location, baseline notes, reporting period, etc." />
          </label>
          <label>
            Asta PowerProject file
            <input name="powerprojectFile" type="file" required accept=".pp,.ppx,.ppp,.ppproj,.zip" />
            <span className="helper">Files are stored in a private Supabase bucket and processed by the worker.</span>
          </label>
          <button type="submit">Queue import</button>
        </form>
        <aside className="card">
          <span className="status-pill">Ready for automation</span>
          <p>
            After submission, the API creates a pending import job. Keep the Windows worker running where Asta
            PowerProject&apos;s COM/OLE automation is available.
          </p>
        </aside>
      </section>
    </main>
  );
}
