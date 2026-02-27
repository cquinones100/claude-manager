import { execa } from "execa";
import type { Worktree, CreateResult, TreeNode } from "../types.js";

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
  startPoint?: string,
): Promise<CreateResult> {
  if (!WORKTREE_NAME_PATTERN.test(name)) {
    return {
      success: false,
      message: `Invalid name "${name}". Use alphanumeric characters, dots, hyphens, or underscores. Must start with alphanumeric.`,
    };
  }

  const worktreePath = `${repoRoot}/.claude/worktrees/${name}`;

  try {
    const args = ["worktree", "add", "-b", name, worktreePath];
    if (startPoint) {
      args.push(startPoint);
    }
    await execa("git", args);

    const parent = startPoint ?? (await getDefaultBranch());
    await execa("git", ["config", `branch.${name}.claude-parent`, parent]);

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

export async function getDefaultBranch(): Promise<string> {
  try {
    await execa("git", ["rev-parse", "--verify", "main"]);
    return "main";
  } catch {
    try {
      await execa("git", ["rev-parse", "--verify", "master"]);
      return "master";
    } catch {
      return "main";
    }
  }
}

export async function getMergeBase(a: string, b: string): Promise<string | null> {
  try {
    const { stdout } = await execa("git", ["merge-base", a, b]);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getConfiguredParent(branch: string): Promise<string | null> {
  try {
    const { stdout } = await execa("git", ["config", `branch.${branch}.claude-parent`]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function getCommitTimestamp(commit: string): Promise<number> {
  try {
    const { stdout } = await execa("git", ["log", "-1", "--format=%ct", commit]);
    return parseInt(stdout.trim(), 10);
  } catch {
    return 0;
  }
}

export async function buildWorktreeTree(worktrees: Worktree[]): Promise<TreeNode> {
  const defaultBranch = await getDefaultBranch();

  const rootWorktree =
    worktrees.find((wt) => wt.branch === defaultBranch) ??
    worktrees.find((wt) => wt.isBare) ??
    worktrees[0];

  if (!rootWorktree) {
    return { worktree: { path: "", head: "", branch: defaultBranch, isBare: true }, children: [] };
  }

  const rootNode: TreeNode = { worktree: rootWorktree, children: [] };
  const remaining = worktrees.filter((wt) => wt !== rootWorktree);

  // Map each worktree to a TreeNode
  const nodeMap = new Map<string, TreeNode>();
  nodeMap.set(rootWorktree.path, rootNode);
  remaining.forEach((wt) => {
    nodeMap.set(wt.path, { worktree: wt, children: [] });
  });

  // Build a branch-name → worktree lookup for explicit parent resolution
  const branchMap = new Map<string, Worktree>();
  worktrees.forEach((wt) => {
    if (wt.branch) {
      branchMap.set(wt.branch, wt);
    }
  });

  // For each non-root worktree, find the best parent
  await Promise.all(
    remaining.map(async (wt) => {
      // Prefer explicit parent from git config, walking up the chain
      // if the immediate parent's worktree was deleted
      if (wt.branch) {
        let parentBranch = await getConfiguredParent(wt.branch);
        const visited = new Set<string>();
        while (parentBranch && !visited.has(parentBranch)) {
          visited.add(parentBranch);
          const parentWorktree = branchMap.get(parentBranch);
          if (parentWorktree) {
            const parentNode = nodeMap.get(parentWorktree.path);
            const childNode = nodeMap.get(wt.path);
            if (parentNode && childNode) {
              parentNode.children.push(childNode);
            }
            return;
          }
          parentBranch = await getConfiguredParent(parentBranch);
        }
        // Had a configured parent but its worktree chain is gone — attach to root
        if (visited.size > 0) {
          const childNode = nodeMap.get(wt.path);
          if (childNode) {
            rootNode.children.push(childNode);
          }
          return;
        }
      }

      // Fall back to merge-base heuristic
      const ref = wt.branch || wt.head;
      let bestParent: Worktree = rootWorktree;
      let bestTimestamp = 0;

      const candidates = worktrees.filter((c) => c !== wt);
      await Promise.all(
        candidates.map(async (candidate) => {
          const candidateRef = candidate.branch || candidate.head;
          const base = await getMergeBase(ref, candidateRef);
          if (!base) return;

          const timestamp = await getCommitTimestamp(base);
          if (timestamp > bestTimestamp) {
            bestTimestamp = timestamp;
            bestParent = candidate;
          }
        }),
      );

      const parentNode = nodeMap.get(bestParent.path);
      const childNode = nodeMap.get(wt.path);
      if (parentNode && childNode) {
        parentNode.children.push(childNode);
      }
    }),
  );

  return rootNode;
}
