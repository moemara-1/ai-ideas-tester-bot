import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadStatusLabels } from "@/lib/dashboard/pipeline";
import { NotFoundError, getLeadById } from "@/lib/campaigns/service";

export const dynamic = "force-dynamic";

type LeadPageProps = {
  params: Promise<{
    leadId: string;
  }>;
};

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function LeadPage({ params }: LeadPageProps) {
  const { leadId } = await params;

  try {
    const lead = await getLeadById(leadId);

    return (
      <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <header className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">Lead Detail</p>
                <h1 className="mt-2 text-3xl font-semibold">{lead.fullName ?? lead.business.name}</h1>
              </div>
              <Link href="/" className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-cyan-400">
                Back to Dashboard
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-400">
              {lead.campaign.name} · {lead.business.name} · {LeadStatusLabels[lead.status]}
            </p>
          </header>

          <section className="grid gap-6 lg:grid-cols-3">
            <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Lead Profile</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">Score</dt>
                  <dd className="text-xl font-semibold text-cyan-300">{lead.score ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Title</dt>
                  <dd>{lead.title ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Contact</dt>
                  <dd>{lead.contactEmail ?? "No email"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Phone</dt>
                  <dd>{lead.contactPhone ?? "No phone"}</dd>
                </div>
              </dl>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 lg:col-span-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Qualification Context</h2>
              <p className="mt-4 text-sm text-slate-200">{lead.websiteSummary ?? "No website summary."}</p>
              <p className="mt-3 text-sm text-slate-400">{lead.qualificationNotes ?? "No qualification notes."}</p>
            </article>
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Demo Sites</h2>
              <div className="mt-4 space-y-3">
                {lead.demoSites.map((site) => (
                  <div key={site.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm">
                    <p className="font-medium text-slate-100">{site.status}</p>
                    <p className="mt-1 truncate text-xs text-cyan-300">{site.productionUrl ?? "No production URL"}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatTimestamp(site.createdAt)}</p>
                  </div>
                ))}
                {lead.demoSites.length === 0 ? <p className="text-sm text-slate-500">No demo sites yet.</p> : null}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Outreach</h2>
              <div className="mt-4 space-y-3">
                {lead.outreachMessages.map((message) => (
                  <div key={message.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm">
                    <p className="font-medium text-slate-100">{message.status}</p>
                    <p className="mt-1 text-xs text-slate-300">{message.subject ?? "No subject"}</p>
                    <p className="mt-1 text-xs text-slate-500">{message.toEmail}</p>
                  </div>
                ))}
                {lead.outreachMessages.length === 0 ? (
                  <p className="text-sm text-slate-500">No outreach messages.</p>
                ) : null}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Payments</h2>
              <div className="mt-4 space-y-3">
                {lead.payments.map((payment) => (
                  <div key={payment.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm">
                    <p className="font-medium text-slate-100">{payment.status}</p>
                    <p className="mt-1 text-xs text-slate-300">
                      {payment.currency} {(payment.amountCents / 100).toFixed(2)}
                    </p>
                    <p className="mt-1 truncate text-xs text-cyan-300">{payment.paymentUrl ?? "No payment URL"}</p>
                  </div>
                ))}
                {lead.payments.length === 0 ? <p className="text-sm text-slate-500">No payments yet.</p> : null}
              </div>
            </article>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Timeline</h2>
              <span className="text-xs text-slate-400">Latest 50 lead events</span>
            </div>
            <div className="space-y-3">
              {lead.timeline.map((entry) => (
                <article key={entry.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-mono text-xs text-cyan-300">{entry.event}</p>
                    <p className="text-xs text-slate-500">{formatTimestamp(entry.occurredAt)}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-200">{entry.message ?? "No event message"}</p>
                </article>
              ))}
              {lead.timeline.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-700 p-3 text-sm text-slate-500">
                  No timeline events yet.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    throw error;
  }
}
