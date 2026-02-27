import { Box, Text, useInput } from "ink";

type DeleteConfirmProps = {
  branch: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function DeleteConfirm({ branch, onConfirm, onCancel }: DeleteConfirmProps) {
  useInput((input, key) => {
    if (input === "y") {
      onConfirm();
    } else if (input === "n" || key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="red">Delete worktree "{branch}"?</Text>
      </Box>
      <Text dimColor>y to confirm, n or Escape to cancel</Text>
    </Box>
  );
}
