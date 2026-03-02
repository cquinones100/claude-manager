import React from "react";

type SessionStatus = "thinking" | "waiting" | "idle";

const statusStyles: Record<SessionStatus, string> = {
  thinking: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  waiting: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  idle: "bg-zinc-700/30 text-zinc-500 border-zinc-700/50",
};

const statusLabels: Record<SessionStatus, string> = {
  thinking: "thinking",
  waiting: "waiting",
  idle: "idle",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusStyles[status]}`}
    >
      {(status === "thinking" || status === "waiting") && (
        <span className="animate-pulse">●</span>
      )}
      {statusLabels[status]}
    </span>
  );
}
