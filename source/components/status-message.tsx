import { Box, Text, useInput } from "ink";
import type { CreateResult } from "../types.js";

type StatusMessageProps = {
  result: CreateResult;
  onDismiss: () => void;
};

export function StatusMessage({ result, onDismiss }: StatusMessageProps) {
  useInput(() => {
    onDismiss();
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text color={result.success ? "green" : "red"}>
        {result.success ? "✓" : "✗"} {result.message}
      </Text>
      <Box marginTop={1}>
        <Text dimColor>Press any key to continue</Text>
      </Box>
    </Box>
  );
}
