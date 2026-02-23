import React, { useState } from "react"
import { Box, Text, useInput, useStdout } from "ink"
import { SessionSummary } from "../types.js"
import { formatRelativeTime } from "../sessions.js"

type SessionCardProps = {
  session: SessionSummary
  isSelected: boolean
}

function SessionCard({ session, isSelected }: SessionCardProps) {
  const truncatedProject =
    session.project.length > 26
      ? session.project.slice(0, 25) + "…"
      : session.project

  return (
    <Box
      width={32}
      flexDirection="column"
      borderStyle="round"
      borderColor={isSelected ? "cyan" : "gray"}
      paddingX={1}
    >
      <Text bold={isSelected}>{truncatedProject}</Text>
      <Text dimColor>
        {formatRelativeTime(session.lastActivityAt)} · {session.entryCount}{" "}
        entries
      </Text>
    </Box>
  )
}

type SessionGridProps = {
  sessions: SessionSummary[]
  onSelect: (sessionId: string) => void
}

export function SessionGrid({ sessions, onSelect }: SessionGridProps) {
  const { stdout } = useStdout()
  const termWidth = stdout?.columns ?? 80
  const columnCount = Math.max(1, Math.floor(termWidth / 32))

  const [cursor, setCursor] = useState(0)

  useInput((input, key) => {
    if (sessions.length === 0) return

    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1))
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(sessions.length - 1, c + 1))
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - columnCount))
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(sessions.length - 1, c + columnCount))
    }
    if (key.return) {
      onSelect(sessions[cursor].sessionId)
    }
  })

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Today's Sessions (0)</Text>
        <Box marginTop={1}>
          <Text dimColor>No sessions today.</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>q: quit</Text>
        </Box>
      </Box>
    )
  }

  const rows: SessionSummary[][] = []
  for (let i = 0; i < sessions.length; i += columnCount) {
    rows.push(sessions.slice(i, i + columnCount))
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Today's Sessions ({sessions.length})</Text>
      <Box flexDirection="column" marginTop={1}>
        {rows.map((row, rowIdx) => (
          <Box key={rowIdx}>
            {row.map((session, colIdx) => {
              const idx = rowIdx * columnCount + colIdx
              return (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  isSelected={idx === cursor}
                />
              )
            })}
          </Box>
        ))}
      </Box>
      <Box marginTop={1} gap={2}>
        <Text dimColor>arrows: navigate</Text>
        <Text dimColor>enter: open</Text>
        <Text dimColor>q: quit</Text>
      </Box>
    </Box>
  )
}
