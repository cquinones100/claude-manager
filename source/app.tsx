import { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import type { AppScreen, CreateResult, ResumeTarget, Worktree } from "./types.js";
import { getRepoRoot, listWorktrees, createWorktree } from "./git/worktree.js";
import { WorktreeList } from "./components/worktree-list.js";
import { CreateWorktree } from "./components/create-worktree.js";
import { StatusMessage } from "./components/status-message.js";

type AppProps = {
  onResume: (target: ResumeTarget) => void;
  activeSessionIds: Set<string>;
  onKillSession: (id: string) => void;
};

export function App({ onResume, activeSessionIds, onKillSession }: AppProps) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<AppScreen>("list");
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [repoRoot, setRepoRoot] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<CreateResult>({ success: false, message: "" });

  useInput((input) => {
    if (screen === "list" && input === "q") {
      exit();
    }
  });

  const loadWorktrees = async () => {
    setLoading(true);
    try {
      const trees = await listWorktrees();
      setWorktrees(trees);
    } catch {
      setError("Failed to list worktrees.");
    }
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const root = await getRepoRoot();
        setRepoRoot(root);
        const trees = await listWorktrees();
        setWorktrees(trees);
      } catch {
        setError("Not inside a git repository.");
        exit();
        return;
      }
      setLoading(false);
    };

    init();
  }, []);

  if (error) {
    return (
      <Box padding={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box padding={1}>
        <Text>
          <Spinner type="dots" /> Loading worktrees…
        </Text>
      </Box>
    );
  }

  if (screen === "create") {
    return (
      <CreateWorktree
        onSubmit={async (name) => {
          const createResult = await createWorktree(name, repoRoot);
          setResult(createResult);
          setScreen("result");
        }}
        onCancel={() => setScreen("list")}
      />
    );
  }

  if (screen === "result") {
    return (
      <StatusMessage
        result={result}
        onDismiss={async () => {
          await loadWorktrees();
          setScreen("list");
        }}
      />
    );
  }

  return (
    <WorktreeList
      worktrees={worktrees}
      activeSessionIds={activeSessionIds}
      onCreateNew={() => setScreen("create")}
      onSelectWorktree={(path, branch) => {
        onResume({ worktreePath: path, label: branch });
        exit();
      }}
      onKillSession={onKillSession}
    />
  );
}
