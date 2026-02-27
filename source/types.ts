export type Worktree = {
  path: string;
  head: string;
  branch: string;
  isBare: boolean;
};

export type AppScreen = "list" | "create" | "result";

export type CreateResult = {
  success: boolean;
  message: string;
};

export type ResumeTarget = {
  worktreePath: string;
  label: string;
};

export type TreeNode = {
  worktree: Worktree;
  children: TreeNode[];
};
