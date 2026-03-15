'use client';

import { useState } from 'react';

export default function DiscoverPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleDiscover = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/ideas/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postsPerSubreddit: 25,
          minUpvotes: 5,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleScore = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/ideas/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 10,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">AI Idea Intelligence</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Discover & Score Ideas</h1>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-xl font-semibold mb-4">Step 1: Discover Ideas</h2>
          <p className="text-slate-400 mb-4">
            Fetch trending posts from AI-related subreddits on Reddit.
          </p>
          <button
            onClick={handleDiscover}
            disabled={loading}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {loading ? 'Discovering...' : 'Discover Ideas'}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-xl font-semibold mb-4">Step 2: Score Ideas</h2>
          <p className="text-slate-400 mb-4">
            Use AI to score discovered ideas based on virality, novelty, and feasibility.
          </p>
          <button
            onClick={handleScore}
            disabled={loading}
            className="rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
          >
            {loading ? 'Scoring...' : 'Score Ideas'}
          </button>
        </div>

        {result && (
          <div
            className={`rounded-2xl border p-6 ${
              result.success
                ? 'border-green-800 bg-green-900/20'
                : 'border-red-800 bg-red-900/20'
            }`}
          >
            <h3 className={`font-semibold ${result.success ? 'text-green-400' : 'text-red-400'}`}>
              {result.success ? 'Success!' : 'Error'}
            </h3>
            <p className="mt-2 text-slate-300">{result.message}</p>
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-xl font-semibold mb-4">Next Steps</h2>
          <ol className="list-decimal list-inside space-y-2 text-slate-400">
            <li>After discovery, ideas will appear in the database</li>
            <li>Run scoring to evaluate each idea</li>
            <li>Use /api/ideas/generate to create code for top-scored ideas</li>
            <li>Monitor the dashboard for progress</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
