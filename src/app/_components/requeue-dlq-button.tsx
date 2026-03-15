"use client";

import { useState } from "react";
import type { DlqQueueName } from "@/workers/queue-names";

type RequeueDlqButtonProps = {
  dlqQueueName: DlqQueueName;
  dlqJobId: string;
};

export function RequeueDlqButton({ dlqQueueName, dlqJobId }: RequeueDlqButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function onClick(): Promise<void> {
    setState("loading");
    setMessage("");

    try {
      const response = await fetch("/api/operations/dlq/requeue", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ dlqQueueName, dlqJobId }),
      });

      const body = (await response.json().catch(() => null)) as
        | {
            requeuedJobId?: string;
            error?: string;
          }
        | null;

      if (!response.ok) {
        setState("error");
        setMessage(body?.error ?? "Failed to requeue job");
        return;
      }

      setState("done");
      setMessage(body?.requeuedJobId ?? "Requeued");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unexpected requeue failure");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          void onClick();
        }}
        disabled={state === "loading"}
        className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "loading" ? "Requeueing..." : "Requeue"}
      </button>
      {message ? (
        <p className={`max-w-[18rem] truncate text-[11px] ${state === "error" ? "text-rose-300" : "text-emerald-300"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
