import { getDashboardSnapshot } from "@/lib/dashboard/service";
import Link from "next/link";

export const dynamic = "force-dynamic";

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusColor(status: string): string {
  switch (status) {
    case "discovered":
      return "bg-blue-100 text-blue-800";
    case "scored":
      return "bg-yellow-100 text-yellow-800";
    case "generating":
      return "bg-purple-100 text-purple-800";
    case "completed":
      return "bg-green-100 text-green-800";
    case "failed":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default async function IdeasPage() {
  // This would be replaced with actual ideas API
  // For now, showing placeholder UI
  
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">AI Idea Intelligence</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Discovered Ideas</h1>
              <p className="mt-1 text-slate-400">
                Ideas from Reddit with scores and generated code
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/ideas/discover"
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
              >
                Discover Ideas
              </Link>
            </div>
          </div>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-xl font-semibold mb-4">How it works</h2>
          <ol className="list-decimal list-inside space-y-2 text-slate-300">
            <li>Click <strong>Discover Ideas</strong> to fetch trending posts from AI subreddits on Reddit</li>
            <li>The system will score each idea based on virality, novelty, and feasibility</li>
            <li>Select ideas to generate actual code implementations</li>
            <li>The generated code is executed and results are captured</li>
            <li>View the generated code and execution results</li>
          </ol>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-xl font-semibold mb-4">API Endpoints</h2>
          <div className="space-y-2 text-sm font-mono">
            <div className="flex gap-4">
              <span className="text-green-400">GET</span>
              <span className="text-slate-300">/api/ideas - List all ideas</span>
            </div>
            <div className="flex gap-4">
              <span className="text-green-400">GET</span>
              <span className="text-slate-300">/api/ideas?stats=true - Get ideas statistics</span>
            </div>
            <div className="flex gap-4">
              <span className="text-blue-400">POST</span>
              <span className="text-slate-300">/api/ideas/discover - Trigger discovery from Reddit</span>
            </div>
            <div className="flex gap-4">
              <span className="text-blue-400">POST</span>
              <span className="text-slate-300">/api/ideas/score - Score discovered ideas</span>
            </div>
            <div className="flex gap-4">
              <span className="text-blue-400">POST</span>
              <span className="text-slate-300">/api/ideas/generate - Generate code for an idea</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-xl font-semibold mb-4">Queue Jobs</h2>
          <p className="text-slate-400 mb-4">The system uses BullMQ for background processing:</p>
          <ul className="list-disc list-inside space-y-1 text-slate-300">
            <li><code>idea.discovery</code> - Fetch posts from Reddit</li>
            <li><code>idea.scoring</code> - Score ideas using LLM</li>
            <li><code>idea.code_generation</code> - Generate code using LLM</li>
            <li><code>idea.execution</code> - Run generated code</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
