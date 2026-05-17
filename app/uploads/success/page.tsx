type SuccessPageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function UploadSuccessPage({ searchParams }: SuccessPageProps) {
  const { id } = await searchParams;

  return (
    <main>
      <section className="card">
        <span className="status-pill">Import queued</span>
        <h1>Thanks — your PowerProject file is ready for processing.</h1>
        <p>
          Upload ID: <code>{id ?? "not available"}</code>
        </p>
        <p>The Windows worker will pick up this job and export the BI tables into Supabase.</p>
      </section>
    </main>
  );
}
