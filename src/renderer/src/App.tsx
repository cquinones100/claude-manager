import { useState, useCallback } from "react";
import PathBar from "./components/PathBar";
import WorktreeList from "./components/WorktreeList";
import EmptyState from "./components/EmptyState";

export type Worktree = {
  path: string;
  head: string;
  branch: string | null;
  isBare: boolean;
  isLocked: boolean;
};

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; worktrees: Worktree[] }
  | { status: "error"; message: string };

declare global {
  interface Window {
    electronAPI: {
      listWorktrees: (path: string) => Promise<Worktree[]>;
      openDirectory: () => Promise<string | null>;
    };
  }
}

export default function App() {
  const [projectPath, setProjectPath] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  const load = useCallback(async (path: string) => {
    if (!path.trim()) return;
    setState({ status: "loading" });
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
        {state.status === "success" && <WorktreeList worktrees={state.worktrees} />}
      </div>
    </div>
  );
}
