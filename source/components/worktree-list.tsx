import { useState, useEffect, memo } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { TreeNode } from "../types.js";
import { Scrollbar } from "./scrollbar.js";

type FlatItem = {
  path: string;
  branch: string;
  isRoot: boolean;
  parentBranch: string | undefined;
};

type WorktreeListProps = {
  tree: TreeNode;
  activeSessionIds: Set<string>;
  onCreateNew: (parentBranch: string) => void;
  onSelectWorktree: (path: string, branch: string) => void;
  onKillSession: (id: string) => void;
  onDeleteWorktree: (path: string, branch: string) => void;
  availableWidth: number | undefined;
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
    path: node.worktree.path,
    branch: node.worktree.branch || "(detached)",
    isRoot: true,
    parentBranch: undefined,
  });

  const addChildren = (parent: TreeNode, parentBranch: string) => {
    parent.children.forEach((child) => {
      items.push({
        path: child.worktree.path,
        branch: child.worktree.branch || "(detached)",
        isRoot: false,
        parentBranch,
      });
      addChildren(child, child.worktree.branch || "(detached)");
    });
  };

  addChildren(node, node.worktree.branch || "(detached)");
  return items;
}

function Shortcut({ keyName, description }: { keyName: string; description: string }) {
  return (
    <Text>
      <Text color="cyan">{keyName}</Text>
      <Text dimColor> {description}</Text>
    </Text>
  );
}

const COLS = 3;
const ROWS = 3;
const CHROME_LINES = 4;

type WorktreeCardProps = {
  item: FlatItem;
  isSelected: boolean;
  isActive: boolean;
  width: number;
  height: number;
};

const WorktreeCard = memo(function WorktreeCard({ item, isSelected, isActive, width, height }: WorktreeCardProps) {
  const borderColor = isSelected ? "cyan" : "gray";

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      width={width}
      height={height}
    >
      <Box flexShrink={0}>
        <Text bold={isSelected} color={isSelected ? "cyan" : undefined} wrap="truncate">
          {isActive && <Text color="green">▶ </Text>}
          {item.branch}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text dimColor wrap="truncate">{abbreviatePath(item.path)}</Text>
      </Box>
      {item.parentBranch && (
        <Box flexShrink={0} marginTop={1}>
          <Text color="cyan" dimColor={!isSelected} wrap="truncate">
            from {item.parentBranch}
          </Text>
        </Box>
      )}
      {item.isRoot && (
        <Box flexShrink={0} marginTop={1}>
          <Text color="magenta" dimColor={!isSelected}>root</Text>
        </Box>
      )}
    </Box>
  );
});

function useTerminalSize() {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    width: stdout?.columns ?? 80,
    height: stdout?.rows ?? 24,
  });

  useEffect(() => {
    const onResize = () => {
      setSize({
        width: stdout?.columns ?? 80,
        height: stdout?.rows ?? 24,
      });
    };
    stdout?.on("resize", onResize);
    return () => { stdout?.off("resize", onResize); };
  }, [stdout]);

  return size;
}

export function WorktreeList({
  tree,
  activeSessionIds,
  onCreateNew,
  onSelectWorktree,
  onKillSession,
  onDeleteWorktree,
  availableWidth,
}: WorktreeListProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const effectiveWidth = availableWidth ?? termWidth;
  const cellWidth = Math.floor(effectiveWidth / COLS);
  const cellHeight = Math.floor((termHeight - CHROME_LINES) / ROWS);

  const items = flattenTree(tree);
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(items.length - 1, c + 1));
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - COLS));
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(items.length - 1, c + COLS));
    }

    if (key.return) {
      const item = items[cursor];
      if (item) onSelectWorktree(item.path, item.branch);
    }
    if (key.delete) {
      const item = items[cursor];
      if (item && activeSessionIds.has(item.path)) {
        onKillSession(item.path);
      }
    }
    if (input === "n") {
      const item = items[cursor];
      if (item) onCreateNew(item.branch);
    }
    if (input === "x") {
      const item = items[cursor];
      if (item && !item.isRoot) {
        onDeleteWorktree(item.path, item.branch);
      }
    }
  });

  const totalRows = Math.ceil(items.length / COLS);
  const cursorRow = Math.floor(cursor / COLS);
  const scrollRow = Math.max(0, Math.min(cursorRow - Math.floor(ROWS / 2), totalRows - ROWS));

  const visibleStart = scrollRow * COLS;
  const visibleEnd = Math.min(items.length, (scrollRow + ROWS) * COLS);
  const visibleItems = items.slice(visibleStart, visibleEnd);

  const rows: FlatItem[][] = [];
  for (let i = 0; i < visibleItems.length; i += COLS) {
    rows.push(visibleItems.slice(i, i + COLS));
  }

  const highlightedItem = items[cursor];
  const highlightedIsActive = highlightedItem !== undefined && activeSessionIds.has(highlightedItem.path);

  return (
    <Box flexDirection="column" padding={1} height={termHeight}>
      <Text bold>Worktrees ({items.length})</Text>
      <Box marginTop={1} flexGrow={1}>
        <Box flexDirection="column" flexGrow={1}>
          {rows.map((row, rowIdx) => (
            <Box key={scrollRow + rowIdx}>
              {row.map((item, colIdx) => {
                const globalIdx = visibleStart + rowIdx * COLS + colIdx;
                return (
                  <WorktreeCard
                    key={item.path}
                    item={item}
                    isSelected={globalIdx === cursor}
                    isActive={activeSessionIds.has(item.path)}
                    width={cellWidth}
                    height={cellHeight}
                  />
                );
              })}
            </Box>
          ))}
        </Box>
        <Scrollbar
          totalItems={totalRows}
          visibleCount={ROWS}
          scrollOffset={scrollRow}
          height={ROWS * cellHeight}
        />
      </Box>
      <Box gap={2}>
        <Shortcut keyName="←↑↓→" description="navigate" />
        <Shortcut keyName="enter" description="sessions" />
        <Shortcut keyName="n" description="create child" />
        {highlightedItem && !highlightedItem.isRoot && <Shortcut keyName="x" description="delete" />}
        {highlightedIsActive && <Shortcut keyName="del" description="kill session" />}
        <Shortcut keyName="esc" description="back" />
        <Shortcut keyName="q" description="quit" />
      </Box>
    </Box>
  );
}
