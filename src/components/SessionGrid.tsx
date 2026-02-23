import React, { useState } from "react"
import { Box, Text, useInput, useStdout } from "ink"
import { ResumeTarget, SessionSummary } from "../types.js"
import { formatRelativeTime } from "../sessions.js"

const COLS = 3
const ROWS = 3
const CHROME_LINES = 4 // padding + title + footer

type SessionCardProps = {
  session: SessionSummary
  isSelected: boolean
  width: number
  height: number
}

function SessionCard({ session, isSelected, width, height }: SessionCardProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isSelected ? "cyan" : "gray"}
      paddingX={1}
      width={width}
      height={height}
    >
      <Text bold={isSelected} wrap="truncate">{session.project}</Text>
      <Text dimColor wrap="truncate">
        {formatRelativeTime(session.lastActivityAt)} · {session.entryCount} entries
      </Text>
      {session.preview.map((line, i) => (
        <Text key={i} color={line.label === "User" ? "green" : "cyan"} dimColor>{line.label}: {line.text}</Text>
      ))}
    </Box>
  )
}

type SessionGridProps = {
  sessions: SessionSummary[]
  onSelect: (sessionId: string) => void
  onResume: (target: ResumeTarget) => void
}

export function SessionGrid({ sessions, onSelect, onResume }: SessionGridProps) {
  const { stdout } = useStdout()
  const termWidth = stdout?.columns ?? 80
  const termHeight = stdout?.rows ?? 24

  const cellWidth = Math.floor(termWidth / COLS)
  const cellHeight = Math.floor((termHeight - CHROME_LINES) / ROWS)

  const [cursor, setCursor] = useState(0)

  const totalRows = Math.ceil(sessions.length / COLS)
  const cursorRow = Math.floor(cursor / COLS)
  const scrollRow = Math.max(0, Math.min(cursorRow - Math.floor(ROWS / 2), totalRows - ROWS))

  useInput((input, key) => {
    if (sessions.length === 0) return

    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1))
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(sessions.length - 1, c + 1))
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - COLS))
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(sessions.length - 1, c + COLS))
    }
    if (key.return) {
      onSelect(sessions[cursor].sessionId)
    }
    if (input === "r") {
      const session = sessions[cursor]
      if (session) {
        onResume({ sessionId: session.sessionId, cwd: session.cwd })
      }
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

  const visibleStart = scrollRow * COLS
  const visibleEnd = Math.min(sessions.length, (scrollRow + ROWS) * COLS)
  const visibleSessions = sessions.slice(visibleStart, visibleEnd)

  const rows: SessionSummary[][] = []
  for (let i = 0; i < visibleSessions.length; i += COLS) {
    rows.push(visibleSessions.slice(i, i + COLS))
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Today's Sessions ({sessions.length})</Text>
      <Box flexDirection="column" marginTop={1}>
        {rows.map((row, rowIdx) => (
          <Box key={scrollRow + rowIdx}>
            {row.map((session, colIdx) => {
              const globalIdx = visibleStart + rowIdx * COLS + colIdx
              return (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  isSelected={globalIdx === cursor}
                  width={cellWidth}
                  height={cellHeight}
                />
              )
            })}
          </Box>
        ))}
      </Box>
      <Box gap={2}>
        <Text dimColor>←↑↓→ navigate</Text>
        <Text dimColor>enter: open</Text>
        <Text dimColor>r: resume</Text>
        <Text dimColor>q: quit</Text>
      </Box>
    </Box>
  )
}
