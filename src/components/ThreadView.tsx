import React, { useState } from "react"
import { Box, Text, useInput, useStdout } from "ink"
import { ThreadItem } from "../types.js"
import { truncate } from "../sessions.js"

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hours = String(d.getHours()).padStart(2, "0")
  const mins = String(d.getMinutes()).padStart(2, "0")
  return `${hours}:${mins}`
}

type ThreadViewProps = {
  items: ThreadItem[]
  onBack: () => void
}

export function ThreadView({ items, onBack }: ThreadViewProps) {
  const { stdout } = useStdout()
  const termHeight = stdout?.rows ?? 24
  const [cursor, setCursor] = useState(0)
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set())

  const visibleCount = Math.max(1, termHeight - 4)
  const scrollOffset = Math.max(
    0,
    Math.min(cursor - Math.floor(visibleCount / 2), items.length - visibleCount)
  )
  const visibleItems = items.slice(scrollOffset, scrollOffset + visibleCount)

  useInput((input, key) => {
    if (input === "q") {
      process.exit(0)
    }
    if (key.escape || input === "b") {
      onBack()
      return
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1))
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(items.length - 1, c + 1))
    }
    if (key.return) {
      setExpandedSet((prev) => {
        const next = new Set(prev)
        if (next.has(cursor)) {
          next.delete(cursor)
        } else {
          next.add(cursor)
        }
        return next
      })
    }
  })

  if (items.length === 0) {
    return (
      <Box padding={1}>
        <Text dimColor>No conversation entries found.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="column">
        {visibleItems.map((item, i) => {
          const globalIdx = scrollOffset + i
          const isSelected = globalIdx === cursor
          const isExpanded = expandedSet.has(globalIdx)
          return (
            <ThreadItemRow
              key={`${globalIdx}-${item.timestamp}`}
              item={item}
              isSelected={isSelected}
              isExpanded={isExpanded}
            />
          )
        })}
      </Box>
      <Box paddingX={1} gap={2}>
        <Text dimColor>↑↓ navigate</Text>
        <Text dimColor>enter expand</Text>
        <Text dimColor>b/esc back</Text>
        <Text dimColor>q quit</Text>
      </Box>
    </Box>
  )
}

type ThreadItemRowProps = {
  item: ThreadItem
  isSelected: boolean
  isExpanded: boolean
}

function ThreadItemRow({ item, isSelected, isExpanded }: ThreadItemRowProps) {
  const cursor = isSelected ? (
    <Text color="cyan" bold>{"▸ "}</Text>
  ) : (
    <Text>{"  "}</Text>
  )

  if (item.kind === "prompt") {
    return <PromptRow item={item} cursor={cursor} isExpanded={isExpanded} />
  }
  if (item.kind === "text") {
    return <TextRow item={item} cursor={cursor} isExpanded={isExpanded} />
  }
  return <ToolRow item={item} cursor={cursor} isExpanded={isExpanded} />
}

type RowProps = {
  cursor: React.ReactNode
  isExpanded: boolean
}

function PromptRow({ item, cursor, isExpanded }: RowProps & { item: ThreadItem & { kind: "prompt" } }) {
  return (
    <Box flexDirection="column">
      <Box>
        {cursor}
        <Text color="green" bold>{"> "}</Text>
        <Text color="green" bold wrap="truncate">
          {isExpanded ? item.text : truncate(item.text, 120)}
        </Text>
        <Text> </Text>
        <Text dimColor>{formatTime(item.timestamp)}</Text>
      </Box>
      {isExpanded && item.text.length > 120 && (
        <Box marginLeft={4} flexDirection="column">
          <Text color="green">{item.text}</Text>
        </Box>
      )}
    </Box>
  )
}

function TextRow({ item, cursor, isExpanded }: RowProps & { item: ThreadItem & { kind: "text" } }) {
  const lines = item.text.split("\n")
  const previewLines = lines.slice(0, 3)
  const preview = previewLines.join("\n")
  const hasMore = lines.length > 3 || item.text.length > 300

  return (
    <Box flexDirection="column">
      <Box>
        {cursor}
        <Text>{"  "}</Text>
        <Text wrap="truncate">
          {isExpanded ? "" : truncate(preview.replace(/\n/g, " "), 120)}
        </Text>
      </Box>
      {isExpanded && (
        <Box marginLeft={4} flexDirection="column">
          <Text>{item.text}</Text>
          {item.model && <Text dimColor>model: {item.model}</Text>}
        </Box>
      )}
    </Box>
  )
}

function ToolRow({ item, cursor, isExpanded }: RowProps & { item: ThreadItem & { kind: "tool" } }) {
  return (
    <Box flexDirection="column">
      <Box>
        {cursor}
        <Text>{"  "}</Text>
        <Text>{isExpanded ? "▾ " : "▸ "}</Text>
        <Text color="yellow" bold>{item.name}</Text>
        <Text dimColor>{"  "}{truncate(item.description.replace(`${item.name}: `, ""), 100)}</Text>
      </Box>
      {isExpanded && (
        <Box marginLeft={6} flexDirection="column">
          {item.result ? (
            <Text color={item.isError ? "red" : "gray"}>{item.result}</Text>
          ) : (
            <Text dimColor>(no result)</Text>
          )}
        </Box>
      )}
    </Box>
  )
}
