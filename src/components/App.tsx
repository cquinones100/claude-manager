import React, { useState, useEffect, useMemo } from "react"
import { Box, Text, useInput, useApp, useStdout } from "ink"
import Spinner from "ink-spinner"
import { loadAllSessions, deriveSessions } from "../sessions.js"
import { FeedEntry, EntryType, View } from "../types.js"
import { FeedItem } from "./FeedItem.js"
import { FilterBar } from "./FilterBar.js"
import { SessionGrid } from "./SessionGrid.js"

const ALL_TYPES: EntryType[] = ["prompt", "response", "tool_use", "tool_result"]

export function App() {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const termHeight = stdout?.rows ?? 24

  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<FeedEntry[]>([])
  const [projects, setProjects] = useState<string[]>([])
  const [view, setView] = useState<View>({ kind: "grid" })
  const [cursor, setCursor] = useState(0)
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set())
  const [activeProject, setActiveProject] = useState<string | null>(null)
  const [activeTypes, setActiveTypes] = useState<Set<EntryType>>(new Set(ALL_TYPES))
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)
  const [projectPickerCursor, setProjectPickerCursor] = useState(0)
  const [typePickerOpen, setTypePickerOpen] = useState(false)
  const [typePickerCursor, setTypePickerCursor] = useState(0)

  useEffect(() => {
    loadAllSessions().then(({ entries, projects }) => {
      setEntries(entries)
      setProjects(projects)
      setLoading(false)
    })
  }, [])

  const sessions = useMemo(() => deriveSessions(entries), [entries])

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (view.kind === "feed" && e.session !== view.sessionId) return false
      if (activeProject && e.project !== activeProject) return false
      if (!activeTypes.has(e.type)) return false
      return true
    })
  }, [entries, activeProject, activeTypes, view])

  // Visible window — reserve lines for the filter bar (5 lines) and header
  const visibleCount = Math.max(1, termHeight - 7)
  const scrollOffset = Math.max(0, Math.min(cursor - Math.floor(visibleCount / 2), filtered.length - visibleCount))
  const visibleEntries = filtered.slice(scrollOffset, scrollOffset + visibleCount)

  useInput((input, key) => {
    if (projectPickerOpen) {
      handleProjectPicker(input, key)
      return
    }
    if (typePickerOpen) {
      handleTypePicker(input, key)
      return
    }

    if (input === "q") {
      exit()
      return
    }
    if (view.kind === "grid") return
    if (key.escape || input === "b") {
      setView({ kind: "grid" })
      setCursor(0)
      setExpandedSet(new Set())
      setActiveProject(null)
      return
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1))
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(filtered.length - 1, c + 1))
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
    if (input === "f") {
      setProjectPickerOpen(true)
      setProjectPickerCursor(0)
    }
    if (input === "t") {
      setTypePickerOpen(true)
      setTypePickerCursor(0)
    }
  })

  function handleProjectPicker(input: string, key: Record<string, boolean>) {
    const options = ["(all)", ...projects]
    if (key.upArrow) {
      setProjectPickerCursor((c) => Math.max(0, c - 1))
    }
    if (key.downArrow) {
      setProjectPickerCursor((c) => Math.min(options.length - 1, c + 1))
    }
    if (key.return) {
      const selected = options[projectPickerCursor]
      setActiveProject(selected === "(all)" ? null : selected)
      setCursor(0)
      setExpandedSet(new Set())
      setProjectPickerOpen(false)
    }
    if (key.escape || input === "f") {
      setProjectPickerOpen(false)
    }
  }

  function handleTypePicker(input: string, key: Record<string, boolean>) {
    if (key.upArrow) {
      setTypePickerCursor((c) => Math.max(0, c - 1))
    }
    if (key.downArrow) {
      setTypePickerCursor((c) => Math.min(ALL_TYPES.length - 1, c + 1))
    }
    if (key.return) {
      const toggleType = ALL_TYPES[typePickerCursor]
      setActiveTypes((prev) => {
        const next = new Set(prev)
        if (next.has(toggleType)) {
          // Don't allow deselecting all
          if (next.size > 1) next.delete(toggleType)
        } else {
          next.add(toggleType)
        }
        return next
      })
      setCursor(0)
      setExpandedSet(new Set())
    }
    if (key.escape || input === "t") {
      setTypePickerOpen(false)
    }
  }

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

  if (projectPickerOpen) {
    const options = ["(all)", ...projects]
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Filter by project (enter to select, esc to cancel):</Text>
        <Box flexDirection="column" marginTop={1}>
          {options.map((p, i) => (
            <Box key={p}>
              <Text color={i === projectPickerCursor ? "cyan" : undefined}>
                {i === projectPickerCursor ? "▸ " : "  "}
                {p}
                {p === activeProject ? " ✓" : p === "(all)" && !activeProject ? " ✓" : ""}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  }

  if (typePickerOpen) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Toggle entry types (enter to toggle, esc to close):</Text>
        <Box flexDirection="column" marginTop={1}>
          {ALL_TYPES.map((t, i) => (
            <Box key={t}>
              <Text color={i === typePickerCursor ? "cyan" : undefined}>
                {i === typePickerCursor ? "▸ " : "  "}
                {activeTypes.has(t) ? "[x]" : "[ ]"} {t}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  }

  if (view.kind === "grid") {
    return (
      <SessionGrid
        sessions={sessions}
        onSelect={(sessionId) => {
          setView({ kind: "feed", sessionId })
          setCursor(0)
          setExpandedSet(new Set())
        }}
      />
    )
  }

  return (
    <Box flexDirection="column">
      <FilterBar
        activeProject={activeProject}
        activeTypes={activeTypes}
        totalCount={entries.length}
        filteredCount={filtered.length}
      />
      {filtered.length === 0 ? (
        <Box padding={1}>
          <Text dimColor>No entries match current filters.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {visibleEntries.map((entry, i) => {
            const globalIdx = scrollOffset + i
            return (
              <FeedItem
                key={`${entry.session}-${entry.timestamp}-${i}`}
                entry={entry}
                isSelected={globalIdx === cursor}
                isExpanded={expandedSet.has(globalIdx)}
              />
            )
          })}
        </Box>
      )}
    </Box>
  )
}
