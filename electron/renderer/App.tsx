import React, { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import { ProjectGrid } from "./components/ProjectGrid";
import { WorktreeGrid } from "./components/WorktreeGrid";
import { SessionGrid } from "./components/SessionGrid";
import { CreateWorktreeModal } from "./components/CreateWorktreeModal";
import { TerminalView } from "./components/TerminalView";
import { SideNav } from "./components/SideNav";

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

type ProjectInfo = {
  repoRoot: string;
  displayName: string;
  displayPath: string;
  sessionCount: number;
  lastActivityAt: string;
};

type Screen =
  | { kind: "projects" }
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
  const [screen, setScreen] = useState<Screen>({ kind: "projects" });
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedRepoRoot, setSelectedRepoRoot] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [repoRoot, setRepoRoot] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activePtyIds, setActivePtyIds] = useState<string[]>([]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listProjects();
      setProjects(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Poll active PTY ids for sidebar
  useEffect(() => {
    if (screen.kind === "projects") return;

    const poll = async () => {
      try {
        const ids = await api.ptyListActive();
        setActivePtyIds(ids);
      } catch {
        // ignore
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [screen.kind]);

  const loadWorktrees = useCallback(async (repoRootOverride?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listWorktrees(repoRootOverride ?? selectedRepoRoot ?? undefined);
      setTree(result.tree);
      setRepoRoot(result.repoRoot);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  }, [selectedRepoRoot]);

  const handleSelectProject = useCallback(
    (project: ProjectInfo) => {
      setSelectedRepoRoot(project.repoRoot);
      setScreen({ kind: "worktrees" });
      loadWorktrees(project.repoRoot);
    },
    [loadWorktrees],
  );

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

  const handleBackToWorktrees = useCallback(() => {
    setScreen({ kind: "worktrees" });
    loadWorktrees();
  }, [loadWorktrees]);

  const handleBackToProjects = useCallback(() => {
    setScreen({ kind: "projects" });
    setSelectedRepoRoot(null);
    setTree(null);
    loadProjects();
  }, [loadProjects]);

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

  const handleSidebarSelectWorktree = useCallback(
    (path: string, branch: string) => {
      setScreen({ kind: "sessions", worktreePath: path, branch });
      loadSessions(path);
    },
    [loadSessions],
  );

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-red-400 text-lg mb-2">Something went wrong</div>
          <div className="text-zinc-500 text-sm max-w-md">{error}</div>
          <button
            onClick={() => {
              setError(null);
              if (selectedRepoRoot) {
                loadWorktrees();
              } else {
                loadProjects();
              }
            }}
            className="mt-4 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading && screen.kind === "projects" && projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-zinc-500 text-lg">Loading projects...</div>
      </div>
    );
  }

  if (loading && screen.kind === "worktrees" && !tree) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-zinc-500 text-lg">Loading worktrees...</div>
      </div>
    );
  }

  // Projects screen has no sidebar
  if (screen.kind === "projects") {
    return (
      <ProjectGrid
        projects={projects}
        onSelect={handleSelectProject}
      />
    );
  }

  // Derive project name and current worktree path for sidebar
  const projectName = repoRoot ? repoRoot.split("/").pop() ?? "Project" : "Project";
  const currentWorktreePath =
    screen.kind === "sessions" ? screen.worktreePath :
    screen.kind === "terminal" ? screen.worktreePath :
    undefined;

  const renderContent = () => {
    switch (screen.kind) {
      case "worktrees":
        return (
          <WorktreeGrid
            tree={tree}
            repoRoot={repoRoot}
            onSelect={handleSelectWorktree}
            onCreate={handleOpenCreate}
            onDelete={handleDelete}
            onBack={handleBackToProjects}
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
            onBack={handleBackToWorktrees}
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
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen">
      <SideNav
        projectName={projectName}
        tree={tree}
        currentScreen={screen.kind}
        currentWorktreePath={currentWorktreePath}
        activePtyIds={activePtyIds}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        onSelectWorktree={handleSidebarSelectWorktree}
        onBackToProjects={handleBackToProjects}
      />
      <div className="flex-1 min-w-0">
        {renderContent()}
      </div>
    </div>
  );
}
