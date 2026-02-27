import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { Worktree } from "../types.js";

type WorktreeListProps = {
  worktrees: Worktree[];
  onCreateNew: () => void;
};

function abbreviatePath(fullPath: string): string {
  const home = process.env["HOME"] ?? "";
  if (home && fullPath.startsWith(home)) {
    return "~" + fullPath.slice(home.length);
  }
  return fullPath;
}

export function WorktreeList({ worktrees, onCreateNew }: WorktreeListProps) {
  const items = [
    ...worktrees.map((wt) => ({
      label: `${wt.branch || "(detached)"} — ${abbreviatePath(wt.path)}`,
      value: wt.path,
    })),
    { label: "+ Create new worktree", value: "__create__" },
  ];

  const handleSelect = (item: { value: string }) => {
    if (item.value === "__create__") {
      onCreateNew();
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Worktrees</Text>
      </Box>
      <SelectInput items={items} onSelect={handleSelect} />
      <Box marginTop={1}>
        <Text dimColor>Press q to exit</Text>
      </Box>
    </Box>
  );
}
