import React from "react"
import { Box, Text } from "ink"
import { FeedEntry } from "../types.js"

const TYPE_COLORS: Record<string, string> = {
  prompt: "green",
  response: "white",
  tool_use: "yellow",
  tool_result: "gray",
}

const TYPE_LABELS: Record<string, string> = {
  prompt: "PROMPT",
  response: "REPLY",
  tool_use: "TOOL",
  tool_result: "RESULT",
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const hours = String(d.getHours()).padStart(2, "0")
  const mins = String(d.getMinutes()).padStart(2, "0")
  const secs = String(d.getSeconds()).padStart(2, "0")
  return `${month}-${day} ${hours}:${mins}:${secs}`
}

type FeedItemProps = {
  entry: FeedEntry
  isSelected: boolean
  isExpanded: boolean
}

export function FeedItem({ entry, isSelected, isExpanded }: FeedItemProps) {
  const color = TYPE_COLORS[entry.type] || "white"
  const label = TYPE_LABELS[entry.type] || entry.type

  return (
    <Box flexDirection="column">
      <Box>
        {isSelected ? (
          <Text color="cyan" bold>{"▸ "}</Text>
        ) : (
          <Text>{"  "}</Text>
        )}
        <Text dimColor>{formatTimestamp(entry.timestamp)}</Text>
        <Text> </Text>
        <Text color="blue">{entry.project.padEnd(20)}</Text>
        <Text> </Text>
        <Text color={color} bold>{label.padEnd(7)}</Text>
        <Text> </Text>
        <Text color={color} wrap="truncate">
          {isExpanded ? "" : entry.content}
        </Text>
      </Box>
      {isExpanded && (
        <Box marginLeft={2} flexDirection="column">
          <Text color={color}>{entry.content}</Text>
          {entry.model && (
            <Text dimColor>model: {entry.model}</Text>
          )}
          <Text dimColor>session: {entry.session}</Text>
        </Box>
      )}
    </Box>
  )
}
