export type Worktree = {
  path: string;
  head: string;
  branch: string;
  isBare: boolean;
};

export type AppScreen = "projects" | "list" | "create" | "result" | "delete-confirm" | "sessions";

export type ProjectInfo = {
  repoRoot: string;
  displayName: string;
  displayPath: string;
  sessionCount: number;
  lastActivityAt: Date;
};

export type CreateResult = {
  success: boolean;
  message: string;
};

export type ResumeTarget = {
  worktreePath: string;
  label: string;
  sessionId: string | undefined;
};

export type EntryType = "prompt" | "response" | "tool_use" | "tool_result";

export type SessionStatus = "thinking" | "waiting" | "idle";

export type FeedEntry = {
  timestamp: string;
  project: string;
  session: string;
  cwd: string | undefined;
  type: EntryType;
  model: string | undefined;
  content: string;
  raw: Record<string, unknown>;
};

export type PendingAction =
  | { kind: "question"; question: string; options: Array<{ label: string; description: string }> }
  | { kind: "tool"; description: string };

export type SessionSummary = {
  sessionId: string;
  project: string;
  cwd: string | undefined;
  lastActivityAt: Date;
  entryCount: number;
  preview: Array<{ label: string; text: string }>;
  model: string | undefined;
  gitBranch: string | undefined;
  status: SessionStatus;
  pendingAction: PendingAction | undefined;
};

export type TreeNode = {
  worktree: Worktree;
  children: TreeNode[];
};
