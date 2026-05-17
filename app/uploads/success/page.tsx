import Link from "next/link";
import { JobStatusPoller } from "@/app/components/JobStatusPoller";

type SuccessPageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function UploadSuccessPage({ searchParams }: SuccessPageProps) {
  const { id } = await searchParams;

  return (
    <main>
      <section className="card">
        <h1>Thanks — your PowerProject file has been queued.</h1>
        <p>
          Upload ID: <code>{id ?? "not available"}</code>
        </p>
        {id ? (
          <JobStatusPoller uploadId={id} />
        ) : (
          <span className="status-pill">Import queued</span>
        )}
        <p>
          The cloud export workflow dispatches a GitHub Actions run on the Windows
          self-hosted runner. BI data will appear in Supabase once the Asta export
          completes.
        </p>
        <p>
          <Link href="/uploads/new">Submit another file</Link>
        </p>
      </section>
    </main>
  );
}
