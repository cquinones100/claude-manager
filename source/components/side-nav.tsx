import { Box, Text } from "ink";
import type { TreeNode } from "../types.js";

type SideNavProps = {
  projectName: string;
  tree: TreeNode | null;
  currentWorktreePath: string | undefined;
  activeSessionIds: Set<string>;
  width: number;
  height: number;
};

type FlatWorktree = {
  path: string;
  branch: string;
  depth: number;
};

function flattenWorktrees(node: TreeNode, depth = 0): FlatWorktree[] {
  const items: FlatWorktree[] = [
    { path: node.worktree.path, branch: node.worktree.branch || "(detached)", depth },
  ];
  node.children.forEach((child) => {
    items.push(...flattenWorktrees(child, depth + 1));
  });
  return items;
}

export function SideNav({
  projectName,
  tree,
  currentWorktreePath,
  activeSessionIds,
  width,
  height,
}: SideNavProps) {
  const worktrees = tree ? flattenWorktrees(tree) : [];
  const activeWorktrees = worktrees.filter((w) => activeSessionIds.has(w.path));

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      <Box flexShrink={0} marginBottom={1}>
        <Text bold color="cyan" wrap="truncate">{projectName}</Text>
      </Box>

      <Box flexShrink={0}>
        <Text dimColor bold>Worktrees</Text>
      </Box>
      <Box flexDirection="column" flexShrink={0} marginBottom={1}>
        {worktrees.map((w) => {
          const isCurrent = w.path === currentWorktreePath;
          const isActive = activeSessionIds.has(w.path);
          const indent = "  ".repeat(w.depth);
          return (
            <Box key={w.path} flexShrink={0}>
              <Text wrap="truncate">
                <Text color={isCurrent ? "cyan" : undefined} bold={isCurrent}>
                  {indent}{isCurrent ? "▸ " : "  "}{w.branch}
                </Text>
                {isActive && <Text color="green"> ●</Text>}
              </Text>
            </Box>
          );
        })}
      </Box>

      {activeWorktrees.length > 0 && (
        <>
          <Box flexShrink={0}>
            <Text dimColor bold>Active Sessions</Text>
          </Box>
          <Box flexDirection="column" overflow="hidden" flexGrow={1}>
            {activeWorktrees.map((w) => (
              <Box key={w.path} flexShrink={0}>
                <Text wrap="truncate">
                  <Text color="green">▶ </Text>
                  <Text dimColor>{w.branch}</Text>
                </Text>
              </Box>
            ))}
          </Box>
        </>
      )}

      <Box flexGrow={1} />
      <Box flexShrink={0}>
        <Text dimColor>
          <Text color="cyan">tab</Text> toggle sidebar
        </Text>
      </Box>
    </Box>
  );
}
