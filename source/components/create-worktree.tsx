import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

type CreateWorktreeProps = {
  onSubmit: (name: string) => void;
  onCancel: () => void;
};

export function CreateWorktree({ onSubmit, onCancel }: CreateWorktreeProps) {
  const [name, setName] = useState("");

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Create new worktree</Text>
      </Box>
      <Box>
        <Text>Name: </Text>
        <TextInput value={name} onChange={setName} onSubmit={onSubmit} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Enter to create, Escape to cancel</Text>
      </Box>
    </Box>
  );
}
