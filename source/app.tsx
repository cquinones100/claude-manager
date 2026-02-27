import { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import type { AppScreen, CreateResult, ResumeTarget, TreeNode } from "./types.js";
import { getRepoRoot, listWorktrees, createWorktree, deleteWorktree, buildWorktreeTree } from "./git/worktree.js";
import { WorktreeList } from "./components/worktree-list.js";
import { CreateWorktree } from "./components/create-worktree.js";
import { DeleteConfirm } from "./components/delete-confirm.js";
import { StatusMessage } from "./components/status-message.js";
import { SessionList } from "./components/session-list.js";

type AppProps = {
  onResume: (target: ResumeTarget) => void;
  activeSessionIds: Set<string>;
  onKillSession: (id: string) => void;
};

export function App({ onResume, activeSessionIds, onKillSession }: AppProps) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<AppScreen>("list");
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [repoRoot, setRepoRoot] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<CreateResult>({ success: false, message: "" });
  const [parentBranch, setParentBranch] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; branch: string }>({ path: "", branch: "" });
  const [sessionsTarget, setSessionsTarget] = useState<{ worktreePath: string; branch: string }>({ worktreePath: "", branch: "" });

  useInput((input) => {
    if (screen === "list" && input === "q") {
      exit();
    }
  });

  const loadWorktrees = async () => {
    setLoading(true);
    try {
      const trees = await listWorktrees();
      setTree(await buildWorktreeTree(trees));
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
        setTree(await buildWorktreeTree(trees));
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
        parentBranch={parentBranch}
        onSubmit={async (name) => {
          const createResult = await createWorktree(name, repoRoot, parentBranch);
          setResult(createResult);
          setScreen("result");
        }}
        onCancel={() => setScreen("list")}
      />
    );
  }

  if (screen === "delete-confirm") {
    return (
      <DeleteConfirm
        branch={deleteTarget.branch}
        onConfirm={async () => {
          if (activeSessionIds.has(deleteTarget.path)) {
            onKillSession(deleteTarget.path);
          }
          const deleteResult = await deleteWorktree(deleteTarget.path, deleteTarget.branch);
          setResult(deleteResult);
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

  if (screen === "sessions") {
    return (
      <SessionList
        worktreePath={sessionsTarget.worktreePath}
        worktreeLabel={sessionsTarget.branch}
        activeSessionIds={activeSessionIds}
        onKillSession={onKillSession}
        onResume={(sessionId) => {
          onResume({
            worktreePath: sessionsTarget.worktreePath,
            label: sessionsTarget.branch,
            sessionId,
          });
          exit();
        }}
        onBack={() => {
          process.stdout.write("\x1b[2J\x1b[H");
          setScreen("list");
        }}
      />
    );
  }

  if (!tree) {
    return (
      <Box padding={1}>
        <Text>
          <Spinner type="dots" /> Loading worktrees…
        </Text>
      </Box>
    );
  }

  return (
    <WorktreeList
      tree={tree}
      activeSessionIds={activeSessionIds}
      onCreateNew={(branch) => {
        setParentBranch(branch);
        setScreen("create");
      }}
      onSelectWorktree={(path, branch) => {
        setSessionsTarget({ worktreePath: path, branch });
        setScreen("sessions");
      }}
      onKillSession={onKillSession}
      onDeleteWorktree={(path, branch) => {
        setDeleteTarget({ path, branch });
        setScreen("delete-confirm");
      }}
    />
  );
}
