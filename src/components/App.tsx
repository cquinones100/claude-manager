import React, { useState, useEffect, useMemo, useRef } from "react"
import { Box, Text, useInput, useApp } from "ink"
import Spinner from "ink-spinner"
import { watch } from "node:fs"
import { loadAllSessions, deriveSessions, loadSessionThread, CLAUDE_DIR } from "../sessions.js"
import { loadHidden, addHidden } from "../hidden.js"
import { FeedEntry, ResumeTarget, View, ThreadItem } from "../types.js"
import { SessionGrid } from "./SessionGrid.js"
import { ThreadView } from "./ThreadView.js"

type AppProps = {
  onResume: (target: ResumeTarget) => void
}

export function App({ onResume }: AppProps) {
  const { exit } = useApp()

  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<FeedEntry[]>([])
  const [view, setView] = useState<View>({ kind: "grid" })
  const [threadItems, setThreadItems] = useState<ThreadItem[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())

  const viewRef = useRef(view)
  viewRef.current = view

  useEffect(() => {
    Promise.all([loadAllSessions(), loadHidden()]).then(([{ entries }, hidden]) => {
      setEntries(entries)
      setHiddenIds(hidden)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (view.kind === "feed") {
      setThreadLoading(true)
      loadSessionThread(view.sessionId).then((items) => {
        setThreadItems(items)
        setThreadLoading(false)
      })
    }
  }, [view])

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | undefined

    const watcher = watch(CLAUDE_DIR, { recursive: true }, (_event, filename) => {
      if (!filename?.endsWith(".jsonl")) return

      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        loadAllSessions().then(({ entries }) => setEntries(entries))

        const current = viewRef.current
        if (current.kind === "feed") {
          loadSessionThread(current.sessionId).then((items) => setThreadItems(items))
        }
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

  if (view.kind === "grid") {
    return (
      <SessionGrid
        sessions={sessions}
        onSelect={(sessionId) => {
          const session = sessions.find((s) => s.sessionId === sessionId)
          setView({ kind: "feed", sessionId, cwd: session?.cwd })
        }}
        onResume={(target) => {
          onResume(target)
          exit()
        }}
        onHide={(sessionId) => {
          addHidden(sessionId)
          setHiddenIds((prev) => new Set([...prev, sessionId]))
        }}
      />
    )
  }

  if (threadLoading) {
    return (
      <Box padding={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Loading conversation…</Text>
      </Box>
    )
  }

  return (
    <ThreadView
      items={threadItems}
      onBack={() => {
        setView({ kind: "grid" })
        setThreadItems([])
      }}
      onResume={() => {
        if (view.kind === "feed") {
          onResume({ sessionId: view.sessionId, cwd: view.cwd })
          exit()
        }
      }}
    />
  )
}
