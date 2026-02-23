import React from "react"
import { Box, Text } from "ink"
import { EntryType } from "../types.js"

type FilterBarProps = {
  activeProject: string | null
  activeTypes: Set<EntryType>
  totalCount: number
  filteredCount: number
}

export function FilterBar({
  activeProject,
  activeTypes,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  const allTypes: EntryType[] = ["prompt", "response", "tool_use", "tool_result"]

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      <Box gap={2}>
        <Text dimColor>
          {filteredCount}/{totalCount} entries
        </Text>
        <Box gap={1}>
          <Text dimColor>project:</Text>
          <Text color={activeProject ? "blue" : "gray"}>
            {activeProject || "all"}
          </Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>types:</Text>
          {allTypes.map((t) => (
            <Text
              key={t}
              color={activeTypes.has(t) ? "green" : "gray"}
              dimColor={!activeTypes.has(t)}
            >
              {t}
            </Text>
          ))}
        </Box>
      </Box>
      <Box gap={2}>
        <Text dimColor>↑↓ navigate</Text>
        <Text dimColor>enter expand</Text>
        <Text dimColor>f filter project</Text>
        <Text dimColor>t toggle types</Text>
        <Text dimColor>q quit</Text>
      </Box>
    </Box>
  )
}
