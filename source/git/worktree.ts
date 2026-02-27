import { execa } from "execa";
import type { Worktree, CreateResult } from "../types.js";

const WORKTREE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export async function getRepoRoot(): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

export async function listWorktrees(): Promise<Worktree[]> {
  const { stdout } = await execa("git", ["worktree", "list", "--porcelain"]);

  if (!stdout.trim()) {
    return [];
  }

  const blocks = stdout.trim().split("\n\n");

  return blocks.map((block: string) => {
    const lines = block.split("\n");
    let path = "";
    let head = "";
    let branch = "";
    let isBare = false;

    lines.forEach((line: string) => {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        branch = line.slice("branch ".length).replace("refs/heads/", "");
      } else if (line === "bare") {
        isBare = true;
      }
    });

    return { path, head, branch, isBare };
  });
}

export async function createWorktree(
  name: string,
  repoRoot: string,
): Promise<CreateResult> {
  if (!WORKTREE_NAME_PATTERN.test(name)) {
    return {
      success: false,
      message: `Invalid name "${name}". Use alphanumeric characters, dots, hyphens, or underscores. Must start with alphanumeric.`,
    };
  }

  const worktreePath = `${repoRoot}/.claude/worktrees/${name}`;

  try {
    await execa("git", ["worktree", "add", "-b", name, worktreePath]);
    return {
      success: true,
      message: `Created worktree "${name}" at ${worktreePath}`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error creating worktree";
    return { success: false, message };
  }
}
