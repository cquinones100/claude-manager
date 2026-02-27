import { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { TreeNode } from "../types.js";

type FlatItem = {
  type: "worktree";
  path: string;
  branch: string;
  prefix: string;
};

type WorktreeListProps = {
  tree: TreeNode;
  activeSessionIds: Set<string>;
  onCreateNew: (parentBranch: string) => void;
  onSelectWorktree: (path: string, branch: string) => void;
  onKillSession: (id: string) => void;
};

function abbreviatePath(fullPath: string): string {
  const home = process.env["HOME"] ?? "";
  if (home && fullPath.startsWith(home)) {
    return "~" + fullPath.slice(home.length);
  }
  return fullPath;
}

function flattenTree(node: TreeNode): FlatItem[] {
  const items: FlatItem[] = [];

  items.push({
    type: "worktree",
    path: node.worktree.path,
    branch: node.worktree.branch || "(detached)",
    prefix: "  ",
  });

  node.children.forEach((child, i) => {
    const isLast = i === node.children.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    items.push({
      type: "worktree",
      path: child.worktree.path,
      branch: child.worktree.branch || "(detached)",
      prefix: "  " + connector,
    });

    flattenSubtree(child, "  " + childPrefix, items);
  });

  return items;
}

function flattenSubtree(node: TreeNode, parentPrefix: string, items: FlatItem[]): void {
  node.children.forEach((child, i) => {
    const isLast = i === node.children.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    items.push({
      type: "worktree",
      path: child.worktree.path,
      branch: child.worktree.branch || "(detached)",
      prefix: parentPrefix + connector,
    });

    flattenSubtree(child, parentPrefix + childPrefix, items);
  });
}

export function WorktreeList({
  tree,
  activeSessionIds,
  onCreateNew,
  onSelectWorktree,
  onKillSession,
}: WorktreeListProps) {
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const items = flattenTree(tree);

  useInput((input, key) => {
    if (key.upArrow) {
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
    } else if (key.downArrow) {
      setHighlightedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      const item = items[highlightedIndex];
      if (!item) return;
      onSelectWorktree(item.path, item.branch);
    } else if (key.delete) {
      const item = items[highlightedIndex];
      if (item && activeSessionIds.has(item.path)) {
        onKillSession(item.path);
      }
    } else if (input === "n") {
      const item = items[highlightedIndex];
      if (item) {
        onCreateNew(item.branch);
      }
    }
  });

  const highlightedItem = items[highlightedIndex];
  const highlightedIsActive =
    highlightedItem?.type === "worktree" && activeSessionIds.has(highlightedItem.path);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Worktrees</Text>
        {activeSessionIds.size > 0 && (
          <Text dimColor>  (● = active session)</Text>
        )}
      </Box>
      <Box flexDirection="column">
        {items.map((item, i) => {
          const isHighlighted = i === highlightedIndex;
          const active = activeSessionIds.has(item.path);
          const indicator = active ? "● " : "  ";

          return (
            <Box key={item.path}>
              <Text inverse={isHighlighted}>
                {item.prefix}{indicator}{item.branch}
                <Text dimColor={!isHighlighted}> — {abbreviatePath(item.path)}</Text>
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          enter to start/resume, n to create child{highlightedIsActive ? ", del to kill session" : ""}, q to exit
        </Text>
      </Box>
    </Box>
  );
}
