import { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import type { AppScreen, CreateResult, ResumeTarget, TreeNode, ProjectInfo } from "./types.js";
import { getRepoRoot, listWorktrees, createWorktree, deleteWorktree, buildWorktreeTree } from "./git/worktree.js";
import { WorktreeList } from "./components/worktree-list.js";
import { CreateWorktree } from "./components/create-worktree.js";
import { DeleteConfirm } from "./components/delete-confirm.js";
import { StatusMessage } from "./components/status-message.js";
import { SessionList } from "./components/session-list.js";
import { ProjectList } from "./components/project-list.js";
import { Layout } from "./components/layout.js";
import { basename } from "node:path";

type AppProps = {
  onResume: (target: ResumeTarget) => void;
  activeSessionIds: Set<string>;
  onKillSession: (id: string) => void;
};

export function App({ onResume, activeSessionIds, onKillSession }: AppProps) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<AppScreen>("projects");
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [repoRoot, setRepoRoot] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreateResult>({ success: false, message: "" });
  const [parentBranch, setParentBranch] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; branch: string }>({ path: "", branch: "" });
  const [sessionsTarget, setSessionsTarget] = useState<{ worktreePath: string; branch: string }>({ worktreePath: "", branch: "" });
  useInput((input, key) => {
    if (screen === "list" && input === "q") {
      exit();
    }
    if (screen === "list" && key.escape) {
      process.stdout.write("\x1b[2J\x1b[H");
      setScreen("projects");
      setTree(null);
    }
  });

  const loadWorktrees = async (cwd?: string) => {
    setLoading(true);
    try {
      const trees = await listWorktrees(cwd);
      setTree(await buildWorktreeTree(trees));
    } catch {
      setError("Failed to list worktrees.");
    }
    setLoading(false);
  };

  const handleProjectSelect = async (project: ProjectInfo) => {
    setRepoRoot(project.repoRoot);
    process.chdir(project.repoRoot);
    setLoading(true);
    setScreen("list");
    try {
      const root = await getRepoRoot(project.repoRoot);
      setRepoRoot(root);
      const trees = await listWorktrees(project.repoRoot);
      setTree(await buildWorktreeTree(trees));
    } catch {
      setError("Failed to load worktrees for this project.");
    }
    setLoading(false);
  };

  if (screen === "projects") {
    return (
      <ProjectList
        onSelect={handleProjectSelect}
        onQuit={() => exit()}
      />
    );
  }

  const projectName = repoRoot ? basename(repoRoot) : "Project";
  const currentWorktreePath = screen === "sessions" ? sessionsTarget.worktreePath : undefined;

  const renderContent = (contentWidth: number) => {
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
          availableWidth={contentWidth}
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
        availableWidth={contentWidth}
      />
    );
  };

  return (
    <Layout
      projectName={projectName}
      tree={tree}
      currentWorktreePath={currentWorktreePath}
      activeSessionIds={activeSessionIds}
    >
      {renderContent}
    </Layout>
  );
}
