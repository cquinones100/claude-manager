import React, { useState, useMemo, useRef, useEffect } from "react"
import { Box, Text, useInput, useStdout } from "ink"
import { PendingQuestion, ResumeTarget, SessionSummary } from "../types.js"
import { formatRelativeTime, formatModelName } from "../sessions.js"
import { Scrollbar } from "./Scrollbar.js"
import { QuestionModal } from "./QuestionModal.js"

type SessionFilter = "active" | "all"

function AnimatedEllipsis() {
  const [dots, setDots] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 500)
    return () => clearInterval(id)
  }, [])
  return <>{".".repeat(dots) + " ".repeat(3 - dots)}</>
}

const COLS = 3
const ROWS = 3
const CHROME_LINES = 4 // padding + title + footer

type SessionCardProps = {
  session: SessionSummary
  isSelected: boolean
  isPulsing: boolean
  width: number
  height: number
}

function SessionCard({ session, isSelected, isPulsing, width, height }: SessionCardProps) {
  const [waitingPulse, setWaitingPulse] = useState(false)
  const isWaiting = session.status === "waiting"

  useEffect(() => {
    if (!isWaiting) {
      setWaitingPulse(false)
      return
    }
    const id = setInterval(() => setWaitingPulse((v) => !v), 1000)
    return () => clearInterval(id)
  }, [isWaiting])

  const borderColor = isPulsing ? "green" : waitingPulse ? "yellow" : isSelected ? "blue" : "gray"

  return (
    <Box
      flexDirection="column"
      borderStyle={isSelected || isPulsing || waitingPulse ? "bold" : "round"}
      borderColor={borderColor}
      paddingX={1}
      width={width}
      height={height}
    >
      <Box flexShrink={0} justifyContent="space-between">
        <Text bold={isSelected} wrap="truncate">{session.project}</Text>
        {session.status === "thinking" && <Text color="blue">thinking<AnimatedEllipsis /></Text>}
        {session.status === "waiting" && <Text color="yellow">waiting<AnimatedEllipsis /></Text>}
      </Box>
      <Box flexShrink={0}>
        <Text dimColor wrap="truncate">
          {[
            formatRelativeTime(session.lastActivityAt),
            session.model && formatModelName(session.model),
            session.gitBranch && `\u2387 ${session.gitBranch}`,
          ].filter(Boolean).join(" · ")}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {session.preview.map((line, i) => (
          <Text key={i} color={line.label === "User" ? "yellow" : "blue"} dimColor>{line.label}: {line.text}</Text>
        ))}
      </Box>
    </Box>
  )
}

type SessionGridProps = {
  sessions: SessionSummary[]
  onSelect: (sessionId: string) => void
  onResume: (target: ResumeTarget) => void
  onHide: (sessionId: string) => void
}

const PULSE_DURATION = 1500

type PendingModal = PendingQuestion & { sessionId: string; cwd: string | undefined }

export function SessionGrid({ sessions, onSelect, onResume, onHide }: SessionGridProps) {
  const { stdout } = useStdout()
  const termWidth = stdout?.columns ?? 80
  const termHeight = stdout?.rows ?? 24

  const cellWidth = Math.floor(termWidth / COLS)
  const cellHeight = Math.floor((termHeight - CHROME_LINES) / ROWS)

  const [cursor, setCursor] = useState(0)
  const [filter, setFilter] = useState<SessionFilter>("active")
  const [pulsingIds, setPulsingIds] = useState<Set<string>>(new Set())
  const prevCountsRef = useRef<Map<string, number>>(new Map())
  const [pendingModal, setPendingModal] = useState<PendingModal | null>(null)

  const filtered = useMemo(
    () => filter === "active" ? sessions.filter((s) => s.status !== "idle") : sessions,
    [sessions, filter],
  )

  useEffect(() => {
    const prev = prevCountsRef.current
    const updated = new Set<string>()

    sessions.forEach((s) => {
      const old = prev.get(s.sessionId)
      if (old !== undefined && old !== s.entryCount) {
        updated.add(s.sessionId)
      }
      prev.set(s.sessionId, s.entryCount)
    })

    if (updated.size > 0) {
      setPulsingIds((current) => new Set([...current, ...updated]))
      setTimeout(() => {
        setPulsingIds((current) => {
          const next = new Set(current)
          updated.forEach((id) => next.delete(id))
          return next
        })
      }, PULSE_DURATION)
    }
  }, [sessions])

  const totalRows = Math.ceil(filtered.length / COLS)
  const cursorRow = Math.floor(cursor / COLS)
  const scrollRow = Math.max(0, Math.min(cursorRow - Math.floor(ROWS / 2), totalRows - ROWS))

  useInput((input, key) => {
    if (input === "f") {
      setFilter((f) => f === "active" ? "all" : "active")
      setCursor(0)
      return
    }

    if (filtered.length === 0) return

    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1))
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(filtered.length - 1, c + 1))
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - COLS))
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(filtered.length - 1, c + COLS))
    }
    if (key.return) {
      onSelect(filtered[cursor].sessionId)
    }
    if (input === "r") {
      const session = filtered[cursor]
      if (session) {
        if (session.pendingQuestion) {
          setPendingModal({
            ...session.pendingQuestion,
            sessionId: session.sessionId,
            cwd: session.cwd,
          })
        } else {
          onResume({ sessionId: session.sessionId, cwd: session.cwd, resumeMessage: undefined })
        }
      }
    }
    if (input === "d") {
      const session = filtered[cursor]
      if (session) {
        onHide(session.sessionId)
        setCursor((c) => Math.min(c, filtered.length - 2))
      }
    }
  }, { isActive: !pendingModal })

  if (pendingModal) {
    return (
      <QuestionModal
        question={pendingModal}
        onSelect={(label) => {
          const { sessionId, cwd } = pendingModal
          setPendingModal(null)
          onResume({ sessionId, cwd, resumeMessage: label })
        }}
        onCancel={() => setPendingModal(null)}
      />
    )
  }

  const filterLabel = filter === "active" ? "Active Sessions" : "Today's Sessions"

  if (filtered.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>{filterLabel} (0)</Text>
        <Box marginTop={1}>
          <Text dimColor>{filter === "active" ? "No active sessions." : "No sessions today."}</Text>
        </Box>
        <Box marginTop={1} gap={2}>
          <Text dimColor>f: {filter === "active" ? "show all" : "active only"}</Text>
          <Text dimColor>q: quit</Text>
        </Box>
      </Box>
    )
  }

  const visibleStart = scrollRow * COLS
  const visibleEnd = Math.min(filtered.length, (scrollRow + ROWS) * COLS)
  const visibleSessions = filtered.slice(visibleStart, visibleEnd)

  const rows: SessionSummary[][] = []
  for (let i = 0; i < visibleSessions.length; i += COLS) {
    rows.push(visibleSessions.slice(i, i + COLS))
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>{filterLabel} ({filtered.length})</Text>
      <Box marginTop={1}>
        <Box flexDirection="column" flexGrow={1}>
          {rows.map((row, rowIdx) => (
            <Box key={scrollRow + rowIdx}>
              {row.map((session, colIdx) => {
                const globalIdx = visibleStart + rowIdx * COLS + colIdx
                return (
                  <SessionCard
                    key={session.sessionId}
                    session={session}
                    isSelected={globalIdx === cursor}
                    isPulsing={pulsingIds.has(session.sessionId)}
                    width={cellWidth}
                    height={cellHeight}
                  />
                )
              })}
            </Box>
          ))}
        </Box>
        <Scrollbar
          totalItems={totalRows}
          visibleCount={ROWS}
          scrollOffset={scrollRow}
          height={ROWS * cellHeight}
        />
      </Box>
      <Box gap={2}>
        <Text dimColor>←↑↓→ navigate</Text>
        <Text dimColor>enter: open</Text>
        <Text dimColor>r: resume</Text>
        <Text dimColor>d: hide</Text>
        <Text dimColor>f: {filter === "active" ? "show all" : "active only"}</Text>
        <Text dimColor>q: quit</Text>
      </Box>
    </Box>
  )
}
