import Link from "next/link";
import { getDashboardSnapshot } from "@/lib/dashboard/service";
import { LeadStatusLabels } from "@/lib/dashboard/pipeline";
import { RequeueDlqButton } from "./_components/requeue-dlq-button";

export const dynamic = "force-dynamic";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function statusPillClasses(status: string): string {
  if (status === "active" || status === "completed" || status === "scheduled") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (status === "failed" || status === "disqualified") {
    return "bg-rose-100 text-rose-800";
  }

  if (status === "paused") {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-slate-100 text-slate-700";
}

export default async function HomePage() {
  const snapshot = await getDashboardSnapshot();
  const activeCampaigns = snapshot.campaigns.filter((campaign) => campaign.status === "active").length;
  const dlqBacklog = snapshot.queueHealth.snapshots.reduce(
    (total, queue) => total + queue.dlqWaiting + queue.dlqDelayed + queue.dlqFailed,
    0
  );

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">OpenClaw Idea Intelligence</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Experiment Pipeline Dashboard</h1>
            </div>
            <p className="text-xs text-slate-400">Snapshot: {formatTimestamp(snapshot.generatedAt)}</p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Campaigns</p>
              <p className="mt-2 text-3xl font-semibold">{snapshot.campaigns.length}</p>
            </article>
            <article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Signals</p>
              <p className="mt-2 text-3xl font-semibold">{snapshot.pipeline.totalLeads}</p>
            </article>
            <article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Active Campaigns</p>
              <p className="mt-2 text-3xl font-semibold">{activeCampaigns}</p>
            </article>
            <article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">DLQ Backlog</p>
              <p className="mt-2 text-3xl font-semibold">{dlqBacklog}</p>
            </article>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pipeline State</h2>
            <span className="text-xs text-slate-400">Signal lifecycle distribution</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {snapshot.pipeline.stages.map((stage) => (
              <article key={stage.status} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <p className="text-xs text-slate-400">{stage.label}</p>
                <p className="mt-2 text-2xl font-semibold text-cyan-300">{stage.count}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Campaigns</h2>
              <span className="text-xs text-slate-400">Latest 10</span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="py-2 pr-4 font-medium">Campaign</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Businesses</th>
                    <th className="py-2 pr-4 font-medium">Leads</th>
                    <th className="py-2 pr-4 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-t border-slate-800">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-100">{campaign.name}</p>
                        <p className="text-xs text-slate-500">
                          {campaign.targetVertical ?? "General"} · {campaign.targetRegion ?? "No region"}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusPillClasses(
                            campaign.status
                          )}`}
                        >
                          {campaign.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-300">{campaign.businessCount}</td>
                      <td className="py-3 pr-4 text-slate-300">{campaign.leadCount}</td>
                      <td className="py-3 pr-4 text-xs text-slate-400">{formatTimestamp(campaign.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Agent Runs</h2>
              <span className="text-xs text-slate-400">Health distribution</span>
            </div>
            <div className="space-y-3">
              {snapshot.agentRuns.map((run) => (
                <div key={run.status} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm capitalize text-slate-300">{run.status}</p>
                    <p className="text-xl font-semibold">{run.count}</p>
                  </div>
                </div>
              ))}
              {snapshot.agentRuns.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-700 p-3 text-sm text-slate-400">
                  No agent runs recorded yet.
                </p>
              ) : null}
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Signals</h2>
              <span className="text-xs text-slate-400">Most recently updated</span>
            </div>
            <div className="space-y-3">
              {snapshot.leads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="block rounded-xl border border-slate-800 bg-slate-900 p-3 transition hover:border-cyan-400/70"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-100">{lead.fullName ?? lead.businessName}</p>
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusPillClasses(
                        lead.status
                      )}`}
                    >
                      {LeadStatusLabels[lead.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {lead.campaignName} · Score {lead.score ?? "-"} · {lead.contactEmail ?? "No email"}
                  </p>
                </Link>
              ))}
              {snapshot.leads.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-700 p-3 text-sm text-slate-400">
                  No leads found.
                </p>
              ) : null}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Activity Timeline</h2>
              <span className="text-xs text-slate-400">Most recent 50 events</span>
            </div>
            <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
              {snapshot.recentActivity.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-xs text-cyan-300">{entry.event}</p>
                    <p className="text-xs text-slate-500">{formatTimestamp(entry.occurredAt)}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-200">{entry.message ?? "No message"}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {entry.queueName ?? "no-queue"} · {entry.jobId ?? "no-job"}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Queue and DLQ Health</h2>
            <p className="text-xs text-slate-400">Operational hardening controls</p>
          </div>

          {snapshot.queueHealth.unavailableReason ? (
            <p className="rounded-xl border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-100">
              Queue health unavailable: {snapshot.queueHealth.unavailableReason}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="py-2 pr-4 font-medium">Queue</th>
                      <th className="py-2 pr-4 font-medium">Waiting</th>
                      <th className="py-2 pr-4 font-medium">Active</th>
                      <th className="py-2 pr-4 font-medium">Failed</th>
                      <th className="py-2 pr-4 font-medium">DLQ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.queueHealth.snapshots.map((queue) => (
                      <tr key={queue.queueName} className="border-t border-slate-800">
                        <td className="py-3 pr-4 font-mono text-xs text-slate-200">{queue.queueName}</td>
                        <td className="py-3 pr-4">{queue.waiting + queue.delayed}</td>
                        <td className="py-3 pr-4">{queue.active}</td>
                        <td className="py-3 pr-4">{queue.failed}</td>
                        <td className="py-3 pr-4">
                          {queue.dlqWaiting + queue.dlqDelayed + queue.dlqFailed}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold text-slate-200">Recent DLQ Jobs</p>
                <div className="space-y-2">
                  {snapshot.queueHealth.recentDlqJobs.map((job) => (
                    <div key={`${job.dlqQueueName}:${job.dlqJobId}`} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-mono text-xs text-slate-300">
                            {job.dlqQueueName} :: {job.dlqJobId}
                          </p>
                          <p className="text-xs text-slate-500">{formatTimestamp(job.failedAt)}</p>
                        </div>
                        <RequeueDlqButton dlqQueueName={job.dlqQueueName} dlqJobId={job.dlqJobId} />
                      </div>
                      <p className="mt-1 text-sm text-rose-300">{job.errorMessage}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Source: {job.sourceQueue} / {job.sourceJobName} / {job.sourceJobId}
                      </p>
                    </div>
                  ))}
                  {snapshot.queueHealth.recentDlqJobs.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-700 p-3 text-sm text-slate-400">
                      DLQ is empty.
                    </p>
                  ) : null}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Requeue endpoint: <code>POST /api/operations/dlq/requeue</code>
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
