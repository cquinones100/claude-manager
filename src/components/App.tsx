import React, { useState, useEffect, useMemo } from "react"
import { Box, Text, useInput, useApp } from "ink"
import Spinner from "ink-spinner"
import { watch } from "node:fs"
import { loadAllSessions, deriveSessions, CLAUDE_DIR } from "../sessions.js"
import { loadHidden, addHidden } from "../hidden.js"
import { loadNames, saveName, removeName } from "../names.js"
import { FeedEntry, ResumeTarget } from "../types.js"
import { SessionGrid } from "./SessionGrid.js"

type AppProps = {
  onResume: (target: ResumeTarget) => void
  activeWindows: Set<string>
  onKillWindow: (id: string) => void
}

export function App({ onResume, activeWindows: initialWindows, onKillWindow }: AppProps) {
  const { exit } = useApp()
  const [activeWindows, setActiveWindows] = useState<Set<string>>(initialWindows)

  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<FeedEntry[]>([])
  const [mtimes, setMtimes] = useState<Map<string, Date>>(new Map())
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [names, setNames] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    Promise.all([loadAllSessions(), loadHidden(), loadNames()]).then(([{ entries, mtimes }, hidden, names]) => {
      setEntries(entries)
      setMtimes(mtimes)
      setHiddenIds(hidden)
      setNames(names)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | undefined

    const watcher = watch(CLAUDE_DIR, { recursive: true }, (_event, filename) => {
      if (!filename?.endsWith(".jsonl")) return

      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        loadAllSessions().then(({ entries, mtimes }) => { setEntries(entries); setMtimes(mtimes) })
      }, 300)
    })

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      watcher.close()
    }
  }, [])

  const sessions = useMemo(
    () => deriveSessions(entries, mtimes).filter((s) => !hiddenIds.has(s.sessionId)),
    [entries, mtimes, hiddenIds],
  )

  const handleResume = (target: ResumeTarget) => {
    onResume(target)
    exit()
  }

  const handleKillWindow = (id: string) => {
    onKillWindow(id)
    setActiveWindows((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  useInput((input) => {
    if (input === "q") {
      exit()
      return
    }
  })

  if (loading) {
    return (
      <Box padding={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Loading sessions…</Text>
      </Box>
    )
  }

  return (
    <SessionGrid
      sessions={sessions}
      names={names}
      onHide={(sessionId) => {
        addHidden(sessionId)
        setHiddenIds((prev) => new Set([...prev, sessionId]))
      }}
      onResume={handleResume}
      activeWindows={activeWindows}
      onKillWindow={handleKillWindow}
      onRename={(sessionId: string, name: string) => {
        if (name) {
          saveName(sessionId, name)
          setNames((prev) => new Map([...prev, [sessionId, name]]))
        } else {
          removeName(sessionId)
          setNames((prev) => {
            const next = new Map(prev)
            next.delete(sessionId)
            return next
          })
        }
      }}
    />
  )
}
