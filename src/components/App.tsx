import React, { useState, useEffect, useMemo } from "react"
import { Box, Text, useInput, useApp } from "ink"
import Spinner from "ink-spinner"
import { watch } from "node:fs"
import { loadAllSessions, deriveSessions, CLAUDE_DIR } from "../sessions.js"
import { loadHidden, addHidden } from "../hidden.js"
import { loadNames, saveName, removeName } from "../names.js"
import { FeedEntry } from "../types.js"
import { SessionGrid } from "./SessionGrid.js"

export function App() {
  const { exit } = useApp()

  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<FeedEntry[]>([])
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [names, setNames] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    Promise.all([loadAllSessions(), loadHidden(), loadNames()]).then(([{ entries }, hidden, names]) => {
      setEntries(entries)
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
        loadAllSessions().then(({ entries }) => setEntries(entries))
      }, 300)
    })

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      watcher.close()
    }
  }, [])

  const sessions = useMemo(
    () => deriveSessions(entries).filter((s) => !hiddenIds.has(s.sessionId)),
    [entries, hiddenIds],
  )

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
      onRename={(sessionId, name) => {
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
