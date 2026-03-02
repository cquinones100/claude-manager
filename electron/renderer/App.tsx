import React, { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import { WorktreeGrid } from "./components/WorktreeGrid";
import { SessionGrid } from "./components/SessionGrid";
import { CreateWorktreeModal } from "./components/CreateWorktreeModal";
import { TerminalView } from "./components/TerminalView";

type TreeNode = {
  worktree: {
    path: string;
    head: string;
    branch: string;
    isBare: boolean;
  };
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

type Screen =
  | { kind: "worktrees" }
  | {
      kind: "sessions";
      worktreePath: string;
      branch: string;
    }
  | {
      kind: "terminal";
      worktreePath: string;
      label: string;
      sessionId: string | undefined;
    }
  | { kind: "create"; parentPath: string; parentBranch: string };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "worktrees" });
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [repoRoot, setRepoRoot] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorktrees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listWorktrees();
      setTree(result.tree);
      setRepoRoot(result.repoRoot);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadWorktrees();
  }, [loadWorktrees]);

  const loadSessions = useCallback(async (worktreePath: string) => {
    const result = await api.loadSessions(worktreePath);
    setSessions(
      result.map((s: SessionSummary) => ({
        ...s,
        lastActivityAt: s.lastActivityAt,
      })),
    );
  }, []);

  const handleSelectWorktree = useCallback(
    (worktreePath: string, branch: string) => {
      setScreen({ kind: "sessions", worktreePath, branch });
      loadSessions(worktreePath);
    },
    [loadSessions],
  );

  const handleResumeSession = useCallback(
    (worktreePath: string, label: string, sessionId: string | undefined) => {
      setScreen({ kind: "terminal", worktreePath, label, sessionId });
    },
    [],
  );

  const handleNewSession = useCallback(
    (worktreePath: string, branch: string) => {
      setScreen({
        kind: "terminal",
        worktreePath,
        label: branch,
        sessionId: undefined,
      });
    },
    [],
  );

  const handleDetach = useCallback(() => {
    if (screen.kind === "terminal") {
      const worktreePath = screen.worktreePath;
      const branch = screen.label;
      setScreen({ kind: "sessions", worktreePath, branch });
      loadSessions(worktreePath);
    }
  }, [screen, loadSessions]);

  const handleBack = useCallback(() => {
    setScreen({ kind: "worktrees" });
    loadWorktrees();
  }, [loadWorktrees]);

  const handleOpenCreate = useCallback(
    (parentPath: string, parentBranch: string) => {
      setScreen({ kind: "create", parentPath, parentBranch });
    },
    [],
  );

  const handleCreateDone = useCallback(
    async (name: string, parentBranch: string) => {
      const result = await api.createWorktree(name, parentBranch);
      if (result.success) {
        setScreen({ kind: "worktrees" });
        await loadWorktrees();
      }
      return result;
    },
    [loadWorktrees],
  );

  const handleDelete = useCallback(
    async (path: string, branch: string) => {
      await api.deleteWorktree(path, branch);
      await loadWorktrees();
    },
    [loadWorktrees],
  );

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-red-400 text-lg mb-2">Failed to load worktrees</div>
          <div className="text-zinc-500 text-sm max-w-md">{error}</div>
          <button
            onClick={loadWorktrees}
            className="mt-4 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading && !tree) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-zinc-500 text-lg">Loading worktrees...</div>
      </div>
    );
  }

  switch (screen.kind) {
    case "worktrees":
      return (
        <WorktreeGrid
          tree={tree}
          repoRoot={repoRoot}
          onSelect={handleSelectWorktree}
          onCreate={handleOpenCreate}
          onDelete={handleDelete}
        />
      );
    case "sessions":
      return (
        <SessionGrid
          worktreePath={screen.worktreePath}
          branch={screen.branch}
          sessions={sessions}
          onRefresh={() => loadSessions(screen.worktreePath)}
          onResume={(sessionId) =>
            handleResumeSession(
              screen.worktreePath,
              screen.branch,
              sessionId,
            )
          }
          onNewSession={() =>
            handleNewSession(screen.worktreePath, screen.branch)
          }
          onBack={handleBack}
        />
      );
    case "terminal":
      return (
        <TerminalView
          worktreePath={screen.worktreePath}
          label={screen.label}
          sessionId={screen.sessionId}
          onDetach={handleDetach}
        />
      );
    case "create":
      return (
        <CreateWorktreeModal
          parentBranch={screen.parentBranch}
          onSubmit={handleCreateDone}
          onCancel={() => {
            setScreen({ kind: "worktrees" });
          }}
        />
      );
  }
}
