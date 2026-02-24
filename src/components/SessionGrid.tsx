import React, { useState, useMemo, useRef, useEffect } from "react"
import { Box, Text, useInput, useStdout } from "ink"
import { execSync } from "node:child_process"
import { PendingAction, ResumeTarget, SessionSummary } from "../types.js"
import { formatRelativeTime, formatModelName } from "../sessions.js"
import { Scrollbar } from "./Scrollbar.js"
import { QuestionModal } from "./QuestionModal.js"
import { RenameModal } from "./RenameModal.js"

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
  customName: string | undefined
  isSelected: boolean
  isPulsing: boolean
  hasWindow: boolean
  width: number
  height: number
}

function SessionCard({ session, customName, isSelected, isPulsing, hasWindow, width, height }: SessionCardProps) {
  const [waitingPulse, setWaitingPulse] = useState(false)
  const isWaiting = session.status === "waiting"

  useEffect(() => {
    if (!isWaiting) return
    const id = setInterval(() => setWaitingPulse((v) => !v), 1000)
    return () => {
      clearInterval(id)
      setWaitingPulse(false)
    }
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
        <Text bold={isSelected} wrap="truncate">{hasWindow && <Text color="green">▶ </Text>}{customName ?? session.project}</Text>
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

function CopiedModal({ onDismiss, termWidth, termHeight }: { onDismiss: () => void; termWidth: number; termHeight: number }) {
  useInput((_input, key) => {
    if (key.return || key.escape) onDismiss()
  })

  const title = "claude resume copied to clipboard"
  const hint = "enter: ok"
  const innerWidth = title.length + 4
  const hintPad = innerWidth - hint.length - 2

  return (
    <Box width={termWidth} height={termHeight} flexDirection="column" justifyContent="center" alignItems="center">
      <Box flexDirection="column">
        <Text color="green">{"╭─ " + title + " " + "─".repeat(innerWidth - title.length - 3) + "╮"}</Text>
        <Text color="green">{"│" + " ".repeat(innerWidth) + "│"}</Text>
        <Text>
          <Text color="green">{"│ "}</Text>
          <Text dimColor>{hint}</Text>
          <Text color="green">{" ".repeat(hintPad) + " │"}</Text>
        </Text>
        <Text color="green">{"╰" + "─".repeat(innerWidth) + "╯"}</Text>
      </Box>
    </Box>
  )
}

function ConfirmResumeModal({ onConfirm, onCancel, termWidth, termHeight }: { onConfirm: () => void; onCancel: () => void; termWidth: number; termHeight: number }) {
  useInput((_input, key) => {
    if (key.return) onConfirm()
    if (key.escape) onCancel()
  })

  const title = "Resume session?"
  const message = "The original session will be closed and recreated within the manager."
  const hint = "enter: confirm · esc: cancel"
  const innerWidth = Math.max(title.length + 4, message.length + 4, hint.length + 4)
  const messagePad = innerWidth - message.length - 2
  const hintPad = innerWidth - hint.length - 2

  return (
    <Box width={termWidth} height={termHeight} flexDirection="column" justifyContent="center" alignItems="center">
      <Box flexDirection="column">
        <Text color="blue">{"╭─ " + title + " " + "─".repeat(innerWidth - title.length - 3) + "╮"}</Text>
        <Text color="blue">{"│" + " ".repeat(innerWidth) + "│"}</Text>
        <Text>
          <Text color="blue">{"│ "}</Text>
          <Text>{message}</Text>
          <Text color="blue">{" ".repeat(messagePad) + " │"}</Text>
        </Text>
        <Text color="blue">{"│" + " ".repeat(innerWidth) + "│"}</Text>
        <Text>
          <Text color="blue">{"│ "}</Text>
          <Text dimColor>{hint}</Text>
          <Text color="blue">{" ".repeat(hintPad) + " │"}</Text>
        </Text>
        <Text color="blue">{"╰" + "─".repeat(innerWidth) + "╯"}</Text>
      </Box>
    </Box>
  )
}

type SessionGridProps = {
  sessions: SessionSummary[]
  names: Map<string, string>
  onHide: (sessionId: string) => void
  onResume: (target: ResumeTarget) => void
  activeWindows: Set<string>
  onKillWindow: (id: string) => void
  onRename: (sessionId: string, name: string) => void
}

function escapeShell(str: string): string {
  return str.replace(/'/g, "'\\''")
}

function buildResumeCommand(sessionId: string, cwd: string | undefined, prompt?: string): string {
  let resume = `claude --resume ${sessionId}`
  if (prompt) resume += ` -p '${escapeShell(prompt)}'`
  if (!cwd) return resume
  return `cd "${cwd}" && ${resume}`
}

function copyToClipboard(text: string) {
  execSync("pbcopy", { input: text })
}

const PULSE_DURATION = 1500

type ModalAction = "copy" | "resume"
type PendingModal = PendingAction & { sessionId: string; cwd: string | undefined; action: ModalAction }

function useTerminalSize() {
  const { stdout } = useStdout()
  const [size, setSize] = useState({
    width: stdout?.columns ?? 80,
    height: stdout?.rows ?? 24,
  })

  useEffect(() => {
    const onResize = () => {
      process.stdout.write("\x1b[2J\x1b[H")
      setSize({
        width: stdout?.columns ?? 80,
        height: stdout?.rows ?? 24,
      })
    }
    stdout?.on("resize", onResize)
    return () => { stdout?.off("resize", onResize) }
  }, [stdout])

  return size
}

export function SessionGrid({ sessions, names, onHide, onResume, activeWindows, onKillWindow, onRename }: SessionGridProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize()

  const cellWidth = Math.floor(termWidth / COLS)
  const cellHeight = Math.floor((termHeight - CHROME_LINES) / ROWS)

  const [cursor, setCursor] = useState(0)
  const [filter, setFilter] = useState<SessionFilter>("active")
  const [pulsingIds, setPulsingIds] = useState<Set<string>>(new Set())
  const prevCountsRef = useRef<Map<string, number>>(new Map())
  const [pendingModal, setPendingModal] = useState<PendingModal | null>(null)
  const [copiedModal, setCopiedModal] = useState(false)
  const [renameModal, setRenameModal] = useState<{ sessionId: string; currentName: string } | null>(null)
  const [confirmResume, setConfirmResume] = useState<ResumeTarget | null>(null)

  const clearScreen = () => process.stdout.write("\x1b[2J\x1b[H")

  function copySessionCommand(sessionId: string, cwd: string | undefined, prompt?: string) {
    const command = buildResumeCommand(sessionId, cwd, prompt)
    copyToClipboard(command)
    setCopiedModal(true)
  }

  function selectSession(session: SessionSummary) {
    if (session.pendingAction) {
      setPendingModal({
        ...session.pendingAction,
        sessionId: session.sessionId,
        cwd: session.cwd,
        action: "copy",
      })
    } else {
      copySessionCommand(session.sessionId, session.cwd)
    }
  }

  function resumeSession(session: SessionSummary) {
    if (activeWindows.has(session.sessionId)) {
      onResume({ sessionId: session.sessionId, cwd: session.cwd, prompt: undefined })
      return
    }
    if (session.pendingAction?.kind === "question") {
      setPendingModal({
        ...session.pendingAction,
        sessionId: session.sessionId,
        cwd: session.cwd,
        action: "resume",
      })
    } else if (session.pendingAction?.kind === "tool") {
      const prompt = `${session.pendingAction.description}\n\nyes, go ahead`
      setConfirmResume({ sessionId: session.sessionId, cwd: session.cwd, prompt })
    } else {
      setConfirmResume({ sessionId: session.sessionId, cwd: session.cwd, prompt: undefined })
    }
  }

  const filtered = useMemo(
    () => filter === "active"
      ? sessions.filter((s) => s.status !== "idle" || (Date.now() - s.lastActivityAt.getTime()) < 5 * 60_000)
      : sessions,
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

  // Mouse click support
  const handleClickRef = useRef<(x: number, y: number) => void>(() => {})
  handleClickRef.current = (x: number, y: number) => {
    if (pendingModal || copiedModal) return
    if (filtered.length === 0) return

    // Grid starts at y=4 (padding=1, title=1, margin=1) and x=2 (padding=1), 1-indexed
    const gridY = y - 4
    const gridX = x - 2
    if (gridY < 0 || gridX < 0) return

    const row = Math.floor(gridY / cellHeight)
    const col = Math.floor(gridX / cellWidth)
    if (row >= ROWS || col >= COLS) return

    const globalIdx = (scrollRow + row) * COLS + col
    if (globalIdx >= filtered.length) return

    setCursor(globalIdx)
    const session = filtered[globalIdx]
    if (activeWindows.has(session.sessionId)) {
      onResume({ sessionId: session.sessionId, cwd: session.cwd, prompt: undefined })
    } else {
      selectSession(session)
    }
  }

  useEffect(() => {
    process.stdout.write("\x1b[?1000h\x1b[?1006h")

    const handler = (data: Buffer) => {
      const match = data.toString().match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/)
      if (!match) return
      const button = parseInt(match[1])
      const isPress = match[4] === "M"
      if (button === 0 && isPress) {
        handleClickRef.current(parseInt(match[2]), parseInt(match[3]))
      }
    }

    process.stdin.on("data", handler)
    return () => {
      process.stdin.off("data", handler)
      process.stdout.write("\x1b[?1000l\x1b[?1006l")
    }
  }, [])

  useInput((input, key) => {
    if (input === "f") {
      clearScreen()
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
      const session = filtered[cursor]
      if (session) selectSession(session)
    }
    if (input === "r") {
      const session = filtered[cursor]
      if (session) resumeSession(session)
    }
    if (input === "x") {
      const session = filtered[cursor]
      if (session && activeWindows.has(session.sessionId)) {
        onKillWindow(session.sessionId)
      }
    }
    if (input === "d") {
      const session = filtered[cursor]
      if (session) {
        onHide(session.sessionId)
        setCursor((c) => Math.min(c, filtered.length - 2))
      }
    }
    if (input === "n") {
      const session = filtered[cursor]
      if (session) {
        setRenameModal({
          sessionId: session.sessionId,
          currentName: names.get(session.sessionId) ?? session.project,
        })
      }
    }
  }, { isActive: !pendingModal && !copiedModal && !renameModal && !confirmResume })

  if (renameModal) {
    return (
      <RenameModal
        currentName={renameModal.currentName}
        onConfirm={(name) => {
          clearScreen()
          onRename(renameModal.sessionId, name)
          setRenameModal(null)
        }}
        onCancel={() => { clearScreen(); setRenameModal(null) }}
        termWidth={termWidth}
        termHeight={termHeight}
      />
    )
  }

  if (confirmResume) {
    return (
      <ConfirmResumeModal
        onConfirm={() => {
          clearScreen()
          onResume(confirmResume)
          setConfirmResume(null)
        }}
        onCancel={() => { clearScreen(); setConfirmResume(null) }}
        termWidth={termWidth}
        termHeight={termHeight}
      />
    )
  }

  if (copiedModal) {
    return <CopiedModal onDismiss={() => { clearScreen(); setCopiedModal(false) }} termWidth={termWidth} termHeight={termHeight} />
  }

  if (pendingModal) {
    const isResume = pendingModal.action === "resume"
    return (
      <QuestionModal
        action={pendingModal}
        confirmLabel={isResume ? "resume" : "copy command"}
        onConfirm={() => {
          const { sessionId, cwd } = pendingModal
          clearScreen()
          setPendingModal(null)
          if (isResume) {
            onResume({ sessionId, cwd, prompt: undefined })
          } else {
            const prompt = pendingModal.kind === "tool"
              ? `${pendingModal.description}\n\nyes, go ahead`
              : undefined
            copySessionCommand(sessionId, cwd, prompt)
          }
        }}
        onCancel={() => { clearScreen(); setPendingModal(null) }}
        termWidth={termWidth}
        termHeight={termHeight}
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
                    customName={names.get(session.sessionId)}
                    isSelected={globalIdx === cursor}
                    isPulsing={pulsingIds.has(session.sessionId)}
                    hasWindow={activeWindows.has(session.sessionId)}
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
        <Text dimColor>r: resume</Text>
        <Text dimColor>x: close window</Text>
        <Text dimColor>enter: copy</Text>
        <Text dimColor>n: rename</Text>
        <Text dimColor>d: hide</Text>
        <Text dimColor>f: {filter === "active" ? "show all" : "active only"}</Text>
        <Text dimColor>q: quit</Text>
      </Box>
    </Box>
  )
}
