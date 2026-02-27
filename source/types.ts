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
