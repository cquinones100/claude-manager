import React, { useEffect, useRef } from "react";
import { TitleBar } from "./WorktreeGrid";
import { StatusBadge } from "./StatusBadge";

type SessionSummary = {
  sessionId: string;
  project: string;
  cwd: string | undefined;
  lastActivityAt: string;
  entryCount: number;
  preview: Array<{ label: string; text: string }>;
  model: string | undefined;
  gitBranch: string | undefined;
  status: "thinking" | "waiting" | "idle";
  pendingAction:
    | {
        kind: "question";
        question: string;
        options: Array<{ label: string; description: string }>;
      }
    | { kind: "tool"; description: string }
    | undefined;
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function formatModelName(raw: string): string {
  const match = raw.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (match) {
    const name = match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1);
    return `${name} ${match[2]}.${match[3]}`;
  }
  return raw;
}

export function SessionGrid({
  worktreePath: _worktreePath,
  branch,
  sessions,
  onRefresh,
  onResume,
  onNewSession,
  onBack,
}: {
  worktreePath: string;
  branch: string;
  sessions: SessionSummary[];
  onRefresh: () => void;
  onResume: (sessionId: string) => void;
  onNewSession: () => void;
  onBack: () => void;
}) {
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    pollRef.current = setInterval(onRefresh, 3000);
    return () => clearInterval(pollRef.current);
  }, [onRefresh]);

  return (
    <div className="h-full flex flex-col">
      <TitleBar title={`Sessions — ${branch}`} onBack={onBack} />
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
        <button
          onClick={onNewSession}
          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded transition-colors"
        >
          New session
        </button>
        <span className="text-xs text-zinc-500">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {sessions.length === 0 ? (
          <div className="text-zinc-500 text-center mt-16">
            No sessions yet. Start a new one.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sessions.map((session) => (
              <SessionCard
                key={session.sessionId}
                session={session}
                onResume={() => onResume(session.sessionId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  onResume,
}: {
  session: SessionSummary;
  onResume: () => void;
}) {
  const lastPreview = session.preview.slice(-4);

  return (
    <div
      onClick={onResume}
      className="group rounded-lg border border-zinc-800 bg-zinc-900 p-4 cursor-pointer
                 hover:border-zinc-600 hover:bg-zinc-800/80 transition-colors flex flex-col"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs text-cyan-400 truncate">
          {session.sessionId.slice(0, 8)}
        </span>
        <StatusBadge status={session.status} />
      </div>
      <div className="flex items-center gap-2 text-[11px] text-zinc-500 mb-3">
        <span>{formatRelativeTime(session.lastActivityAt)}</span>
        {session.model && (
          <>
            <span>·</span>
            <span>{formatModelName(session.model)}</span>
          </>
        )}
        {session.gitBranch && (
          <>
            <span>·</span>
            <span className="text-zinc-600 truncate">
              ⌇ {session.gitBranch}
            </span>
          </>
        )}
      </div>
      <div className="flex-1 space-y-1.5 min-h-0">
        {lastPreview.map((entry, i) => (
          <PreviewBubble key={i} label={entry.label} text={entry.text} />
        ))}
      </div>
      {session.pendingAction && (
        <PendingActionBar action={session.pendingAction} />
      )}
    </div>
  );
}

function PreviewBubble({ label, text }: { label: string; text: string }) {
  const isUser = label === "User";
  return (
    <div
      className={`text-xs rounded px-2 py-1 leading-relaxed truncate ${
        isUser
          ? "bg-yellow-500/10 text-yellow-200/80 ml-4"
          : "bg-blue-500/10 text-blue-200/80 mr-4"
      }`}
    >
      <span className="text-[10px] uppercase tracking-wider opacity-50 mr-1">
        {label}
      </span>
      {text}
    </div>
  );
}

function PendingActionBar({
  action,
}: {
  action:
    | {
        kind: "question";
        question: string;
        options: Array<{ label: string; description: string }>;
      }
    | { kind: "tool"; description: string };
}) {
  return (
    <div className="mt-2 pt-2 border-t border-zinc-800">
      <div className="text-[10px] uppercase tracking-wider text-yellow-500 mb-1">
        {action.kind === "question" ? "Question" : "Tool"}
      </div>
      <div className="text-xs text-zinc-400 truncate">
        {action.kind === "question" ? action.question : action.description}
      </div>
    </div>
  );
}
