import React, { useState } from "react"
import { Box, Text, useInput, useStdout } from "ink"
import { ResumeTarget, SessionSummary } from "../types.js"
import { formatRelativeTime } from "../sessions.js"
import { Scrollbar } from "./Scrollbar.js"

type SessionCardProps = {
  session: SessionSummary
  isSelected: boolean
}

function SessionCard({ session, isSelected }: SessionCardProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isSelected ? "cyan" : "gray"}
      paddingX={1}
    >
      <Box gap={2}>
        <Text bold={isSelected}>{session.project}</Text>
        <Text dimColor>
          {formatRelativeTime(session.lastActivityAt)} · {session.entryCount}{" "}
          entries
        </Text>
      </Box>
      {session.preview.claude && (
        <Text dimColor wrap="truncate">Claude: {session.preview.claude}</Text>
      )}
      {session.preview.user && (
        <Text dimColor wrap="truncate">User: {session.preview.user}</Text>
      )}
    </Box>
  )
}

type SessionGridProps = {
  sessions: SessionSummary[]
  onSelect: (sessionId: string) => void
  onResume: (target: ResumeTarget) => void
}

const CARD_HEIGHT = 5 // border top + header + claude preview + user preview + border bottom
const CHROME_LINES = 6 // padding, title, margins, footer

export function SessionGrid({ sessions, onSelect, onResume }: SessionGridProps) {
  const { stdout } = useStdout()
  const termHeight = stdout?.rows ?? 24
  const visibleCount = Math.max(1, Math.floor((termHeight - CHROME_LINES) / CARD_HEIGHT))
  const [cursor, setCursor] = useState(0)

  useInput((input, key) => {
    if (sessions.length === 0) return

    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1))
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(sessions.length - 1, c + 1))
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

  const scrollOffset = Math.max(0, Math.min(cursor - Math.floor(visibleCount / 2), sessions.length - visibleCount))
  const visibleSessions = sessions.slice(scrollOffset, scrollOffset + visibleCount)

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Today's Sessions ({sessions.length})</Text>
      <Box marginTop={1}>
        <Box flexDirection="column" flexGrow={1}>
          {visibleSessions.map((session, i) => (
            <SessionCard
              key={session.sessionId}
              session={session}
              isSelected={scrollOffset + i === cursor}
            />
          ))}
        </Box>
        <Scrollbar
          totalItems={sessions.length}
          visibleCount={visibleCount}
          scrollOffset={scrollOffset}
          height={visibleCount * CARD_HEIGHT}
        />
      </Box>
      <Box marginTop={1} gap={2}>
        <Text dimColor>↑↓ navigate</Text>
        <Text dimColor>enter: open</Text>
        <Text dimColor>r: resume</Text>
        <Text dimColor>q: quit</Text>
      </Box>
    </Box>
  )
}
