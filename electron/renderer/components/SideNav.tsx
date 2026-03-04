import React from "react";

type Worktree = {
  path: string;
  head: string;
  branch: string;
  isBare: boolean;
};

type TreeNode = {
  worktree: Worktree;
  children: TreeNode[];
};

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

type ActiveSession = {
  worktreePath: string;
  session: SessionSummary;
};

type FlatWorktree = {
  path: string;
  branch: string;
  depth: number;
};

function flattenTree(node: TreeNode, depth = 0): FlatWorktree[] {
  const items: FlatWorktree[] = [
    { path: node.worktree.path, branch: node.worktree.branch || "(detached)", depth },
  ];
  node.children.forEach((child) => {
    items.push(...flattenTree(child, depth + 1));
  });
  return items;
}

function statusBadge(status: SessionSummary["status"]) {
  const config = {
    thinking: { label: "Thinking", color: "bg-amber-400" },
    waiting: { label: "Waiting", color: "bg-cyan-400" },
    idle: { label: "Idle", color: "bg-emerald-400" },
  }[status];

  return (
    <span className="flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${config.color} shrink-0`} />
      <span className="text-[10px] text-zinc-500">{config.label}</span>
    </span>
  );
}

type SideNavProps = {
  projectName: string;
  tree: TreeNode | null;
  currentScreen: string;
  currentWorktreePath: string | undefined;
  activeSessions: ActiveSession[];
  collapsed: boolean;
  onToggle: () => void;
  onSelectWorktree: (path: string, branch: string) => void;
  onSelectActiveSession: (worktreePath: string) => void;
  onBackToProjects: () => void;
};

export function SideNav({
  projectName,
  tree,
  currentScreen,
  currentWorktreePath,
  activeSessions,
  collapsed,
  onToggle,
  onSelectWorktree,
  onSelectActiveSession,
  onBackToProjects,
}: SideNavProps) {
  const worktrees = tree ? flattenTree(tree) : [];
  const activeWorktreePaths = new Set(activeSessions.map((a) => a.worktreePath));

  if (collapsed) {
    return (
      <div className="flex flex-col items-center w-10 border-r border-zinc-800 bg-zinc-950 pt-10 shrink-0">
        <button
          onClick={onToggle}
          className="text-zinc-500 hover:text-zinc-300 text-sm p-1 transition-colors"
          title="Expand sidebar"
        >
          &rsaquo;
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-56 border-r border-zinc-800 bg-zinc-950 pt-10 shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 pb-2 border-b border-zinc-800">
        <button
          onClick={onBackToProjects}
          className="text-sm font-semibold text-cyan-400 hover:text-cyan-300 truncate transition-colors"
          title="Back to projects"
        >
          {projectName}
        </button>
        <button
          onClick={onToggle}
          className="text-zinc-500 hover:text-zinc-300 text-sm p-1 transition-colors shrink-0"
          title="Collapse sidebar"
        >
          &lsaquo;
        </button>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">
          Worktrees
        </div>
        <div className="space-y-0.5">
          {worktrees.map((w) => {
            const isCurrent = w.path === currentWorktreePath;
            const isActive = activeWorktreePaths.has(w.path);
            return (
              <button
                key={w.path}
                onClick={() => onSelectWorktree(w.path, w.branch)}
                className={`w-full text-left text-xs px-2 py-1 rounded truncate transition-colors flex items-center gap-1.5 ${
                  isCurrent
                    ? "bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-400"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
                style={{ paddingLeft: `${w.depth * 12 + 8}px` }}
              >
                <span className="truncate">{w.branch}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {activeSessions.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">
              Active Sessions
            </div>
            <div className="space-y-1">
              {activeSessions.map(({ worktreePath, session }) => {
                const lastPreview = session.preview.at(-1);
                return (
                  <button
                    key={worktreePath}
                    onClick={() => onSelectActiveSession(worktreePath)}
                    className="w-full text-left text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 px-2 py-1.5 rounded transition-colors"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-medium text-zinc-300">
                        {session.sessionId.slice(0, 8)}
                      </span>
                      {statusBadge(session.status)}
                    </div>
                    {lastPreview && (
                      <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                        {lastPreview.label}: {lastPreview.text.slice(0, 60)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
