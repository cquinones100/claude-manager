import { useState, useCallback } from "react";
import PathBar from "./components/PathBar";
import WorktreeList from "./components/WorktreeList";
import SessionList from "./components/SessionList";
import EmptyState from "./components/EmptyState";

export type ClaudeSession = {
  name: string;
  sessionId: string;
  sourceBranch: string;
  createdAt: number;
};

export type Worktree = {
  path: string;
  head: string;
  branch: string | null;
  isBare: boolean;
  isLocked: boolean;
  claudeSession: ClaudeSession | null;
};

export type SessionInfo = {
  sessionId: string;
  title: string | null;
  model: string | null;
  startedAt: string;
  lastActiveAt: string;
  isArchived: boolean;
  completedTurns: number;
  source: "desktop" | "cli";
};

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; worktrees: Worktree[] }
  | { status: "error"; message: string };

type View =
  | { kind: "list" }
  | { kind: "sessions"; worktree: Worktree; sessions: SessionInfo[]; loading: boolean };

declare global {
  interface Window {
    electronAPI: {
      listWorktrees: (path: string) => Promise<Worktree[]>;
      listSessions: (worktreePath: string) => Promise<SessionInfo[]>;
      openDirectory: () => Promise<string | null>;
    };
  }
}

export default function App() {
  const [projectPath, setProjectPath] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [view, setView] = useState<View>({ kind: "list" });

  const load = useCallback(async (path: string) => {
    if (!path.trim()) return;
    setState({ status: "loading" });
    setView({ kind: "list" });
    try {
      const worktrees = await window.electronAPI.listWorktrees(path.trim());
      setState({ status: "success", worktrees });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }, []);

  const handleBrowse = useCallback(async () => {
    const dir = await window.electronAPI.openDirectory();
    if (dir) {
      setProjectPath(dir);
      load(dir);
    }
  }, [load]);

  const handleSubmit = useCallback(
    (path: string) => {
      setProjectPath(path);
      load(path);
    },
    [load]
  );

  const handleWorktreeClick = useCallback(async (worktree: Worktree) => {
    setView({ kind: "sessions", worktree, sessions: [], loading: true });
    try {
      const sessions = await window.electronAPI.listSessions(worktree.path);
      setView({ kind: "sessions", worktree, sessions, loading: false });
    } catch {
      setView({ kind: "sessions", worktree, sessions: [], loading: false });
    }
  }, []);

  const handleBack = useCallback(() => {
    setView({ kind: "list" });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <PathBar
        value={projectPath}
        onChange={setProjectPath}
        onSubmit={handleSubmit}
        onBrowse={handleBrowse}
        loading={state.status === "loading"}
      />
      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {state.status === "idle" && <EmptyState message="Enter a project path to list its worktrees." />}
        {state.status === "loading" && <EmptyState message="Loading worktrees…" />}
        {state.status === "error" && <EmptyState message={state.message} isError />}
        {state.status === "success" && view.kind === "list" && (
          <WorktreeList worktrees={state.worktrees} onWorktreeClick={handleWorktreeClick} />
        )}
        {view.kind === "sessions" && (
          <SessionList
            worktree={view.worktree}
            sessions={view.sessions}
            loading={view.loading}
            onBack={handleBack}
          />
        )}
      </div>
    </div>
  );
}
