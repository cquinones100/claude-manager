import { useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import type { Worktree } from "../types.js";

type WorktreeListProps = {
  worktrees: Worktree[];
  activeSessionIds: Set<string>;
  onCreateNew: () => void;
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

export function WorktreeList({
  worktrees,
  activeSessionIds,
  onCreateNew,
  onSelectWorktree,
  onKillSession,
}: WorktreeListProps) {
  const [highlightedValue, setHighlightedValue] = useState<string>("");

  const items = [
    ...worktrees.map((wt) => {
      const active = activeSessionIds.has(wt.path);
      const indicator = active ? "● " : "  ";
      return {
        label: `${indicator}${wt.branch || "(detached)"} — ${abbreviatePath(wt.path)}`,
        value: wt.path,
      };
    }),
    { label: "  + Create new worktree", value: "__create__" },
  ];

  useInput((_input, key) => {
    if (key.delete && highlightedValue && activeSessionIds.has(highlightedValue)) {
      onKillSession(highlightedValue);
    }
  });

  const handleSelect = (item: { value: string }) => {
    if (item.value === "__create__") {
      onCreateNew();
      return;
    }
    const wt = worktrees.find((w) => w.path === item.value);
    if (wt) {
      onSelectWorktree(wt.path, wt.branch);
    }
  };

  const handleHighlight = (item: { value: string }) => {
    setHighlightedValue(item.value);
  };

  const highlightedIsActive = highlightedValue !== "" && activeSessionIds.has(highlightedValue);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Worktrees</Text>
        {activeSessionIds.size > 0 && (
          <Text dimColor>  (● = active session)</Text>
        )}
      </Box>
      <SelectInput items={items} onSelect={handleSelect} onHighlight={handleHighlight} />
      <Box marginTop={1}>
        <Text dimColor>
          enter to start/resume{highlightedIsActive ? ", del to kill session" : ""}, q to exit
        </Text>
      </Box>
    </Box>
  );
}
