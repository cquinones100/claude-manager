import React, { useState, useEffect, useMemo } from "react"
import { Box, Text, useInput, useApp } from "ink"
import Spinner from "ink-spinner"
import { loadAllSessions, deriveSessions, loadSessionThread } from "../sessions.js"
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

  useEffect(() => {
    loadAllSessions().then(({ entries }) => {
      setEntries(entries)
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

  const sessions = useMemo(() => deriveSessions(entries), [entries])

  useInput((input) => {
    if (input === "q") {
      exit()
      return
    }
  })

  if (loading) {
    return (
      <Box padding={1}>
        <Text color="cyan">
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
      />
    )
  }

  if (threadLoading) {
    return (
      <Box padding={1}>
        <Text color="cyan">
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
