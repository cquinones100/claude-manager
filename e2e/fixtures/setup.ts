import { execSync } from "child_process";
import { mkdirSync, writeFileSync, rmSync, realpathSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export type FixtureContext = {
  repoPath: string;
  worktreePath: string;
  appDataPath: string;
  claudeHomePath: string;
  sessionJsonlPath: string;
  cleanup: () => void;
};

export function createFixture(): FixtureContext {
  const rawBase = join(tmpdir(), `wt-viewer-test-${Date.now()}`);
  mkdirSync(rawBase, { recursive: true });
  // Resolve symlinks (macOS /tmp → /private/var/...) so paths match what git reports
  const base = realpathSync(rawBase);
  const repoPath = join(base, "repo");
  const worktreePath = join(repoPath, ".claude", "worktrees", "test-worktree");
  const appDataPath = join(base, "appdata");
  const claudeHomePath = join(base, "claude-home");

  mkdirSync(repoPath, { recursive: true });

  // Init a git repo with a commit
  execSync("git init", { cwd: repoPath });
  execSync("git checkout -b main", { cwd: repoPath });
  writeFileSync(join(repoPath, "README.md"), "# Test repo\n");
  execSync("git add -A", { cwd: repoPath });
  execSync('git commit -m "initial commit"', {
    cwd: repoPath,
    env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@test.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@test.com" },
  });

  // Create a worktree
  mkdirSync(join(repoPath, ".claude", "worktrees"), { recursive: true });
  execSync(`git worktree add "${worktreePath}" -b claude/test-worktree`, {
    cwd: repoPath,
  });

  // Create a second commit on the worktree branch
  writeFileSync(join(worktreePath, "new-file.txt"), "hello\n");
  execSync("git add -A", { cwd: worktreePath });
  execSync('git commit -m "worktree commit"', {
    cwd: worktreePath,
    env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@test.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@test.com" },
  });

  // --- Mock Claude Desktop app data ---
  const claudeDir = join(appDataPath, "Claude");
  mkdirSync(claudeDir, { recursive: true });

  // git-worktrees.json
  writeFileSync(
    join(claudeDir, "git-worktrees.json"),
    JSON.stringify({
      worktrees: {
        "local_test-session-id": {
          name: "test-worktree",
          path: worktreePath,
          sessionId: "local_test-session-id",
          baseRepo: repoPath,
          branch: "claude/test-worktree",
          sourceBranch: "main",
          createdAt: Date.now() - 3600000,
        },
      },
    })
  );

  // Desktop session metadata
  const sessionsDir = join(claudeDir, "claude-code-sessions", "window-1", "project-1");
  mkdirSync(sessionsDir, { recursive: true });

  const cliSessionId = "cli-session-1";
  writeFileSync(
    join(sessionsDir, "local_test-session-id.json"),
    JSON.stringify({
      sessionId: "local_test-session-id",
      cliSessionId,
      cwd: worktreePath,
      originCwd: repoPath,
      worktreePath,
      worktreeName: "test-worktree",
      sourceBranch: "main",
      createdAt: Date.now() - 3600000,
      lastActivityAt: Date.now() - 1800000,
      model: "claude-sonnet-4-6",
      isArchived: false,
      title: "Add unit tests to the project",
      permissionMode: "default",
      remoteMcpServersConfig: [],
      completedTurns: 3,
    })
  );

  // --- Mock CLI session JSONL ---
  const escapedPath = worktreePath.replace(/[/.]/g, "-");
  const projectDir = join(claudeHomePath, "projects", escapedPath);
  mkdirSync(projectDir, { recursive: true });

  const messages = [
    {
      type: "user",
      isSidechain: false,
      message: { role: "user", content: "add unit tests to the project" },
      uuid: "msg-1",
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      sessionId: cliSessionId,
    },
    {
      type: "assistant",
      isSidechain: false,
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "I'll help you set up unit tests. Let me start by examining the project structure.",
          },
        ],
      },
      uuid: "msg-2",
      timestamp: new Date(Date.now() - 3500000).toISOString(),
      sessionId: cliSessionId,
    },
    {
      type: "assistant",
      isSidechain: false,
      message: {
        role: "assistant",
        content: [{ type: "tool_use", name: "Read", id: "tool-1" }],
      },
      uuid: "msg-3",
      timestamp: new Date(Date.now() - 3400000).toISOString(),
      sessionId: cliSessionId,
    },
    {
      type: "user",
      isSidechain: false,
      isMeta: false,
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tool-1", content: "file contents here" },
        ],
      },
      uuid: "msg-4",
      timestamp: new Date(Date.now() - 3300000).toISOString(),
      sessionId: cliSessionId,
    },
    {
      type: "assistant",
      isSidechain: false,
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "I've reviewed the code. Here's my plan for adding tests.",
          },
        ],
      },
      uuid: "msg-5",
      timestamp: new Date(Date.now() - 3200000).toISOString(),
      sessionId: cliSessionId,
    },
    {
      type: "user",
      isSidechain: false,
      message: { role: "user", content: "looks good, go ahead" },
      uuid: "msg-6",
      timestamp: new Date(Date.now() - 3100000).toISOString(),
      sessionId: cliSessionId,
    },
  ];

  writeFileSync(
    join(projectDir, `${cliSessionId}.jsonl`),
    messages.map((m) => JSON.stringify(m)).join("\n") + "\n"
  );

  const sessionJsonlPath = join(projectDir, `${cliSessionId}.jsonl`);

  return {
    repoPath,
    worktreePath,
    appDataPath,
    claudeHomePath,
    sessionJsonlPath,
    cleanup: () => {
      try {
        execSync(`git worktree remove "${worktreePath}" --force`, { cwd: repoPath });
      } catch {
        // already removed
      }
      rmSync(base, { recursive: true, force: true });
    },
  };
}
