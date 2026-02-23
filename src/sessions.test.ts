import { describe, it, expect } from "vitest"
import {
  truncate,
  projectNameFromDir,
  parseEntry,
  loadAllSessions,
  deriveSessions,
  formatRelativeTime,
} from "./sessions.js"
import { FeedEntry } from "./types.js"

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hello")).toBe("hello")
  })

  it("truncates strings exceeding the limit", () => {
    const long = "a".repeat(250)
    const result = truncate(long)
    expect(result.length).toBe(201) // 200 chars + ellipsis
    expect(result.endsWith("…")).toBe(true)
  })

  it("respects custom max length", () => {
    const result = truncate("hello world", 5)
    expect(result).toBe("hello…")
  })
})

describe("projectNameFromDir", () => {
  it("extracts project name from encoded path", () => {
    expect(projectNameFromDir("-Users-cquinones-editor-configs")).toBe(
      "editor-configs"
    )
  })

  it("handles multi-segment project names", () => {
    expect(
      projectNameFromDir("-Users-cquinones-my-cool-project")
    ).toBe("my-cool-project")
  })

  it("returns raw name when pattern does not match", () => {
    expect(projectNameFromDir("some-weird-dir")).toBe("some-weird-dir")
  })
})

describe("parseEntry", () => {
  const project = "test-project"
  const session = "abc-123"

  it("parses a user prompt (string content)", () => {
    const raw = {
      type: "user",
      timestamp: "2026-02-23T17:48:57.041Z",
      message: {
        role: "user",
        content: "make a CLI tool",
      },
    }
    const entries = parseEntry(raw, project, session, undefined)
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe("prompt")
    expect(entries[0].content).toBe("make a CLI tool")
    expect(entries[0].project).toBe(project)
    expect(entries[0].session).toBe(session)
  })

  it("parses an assistant text response", () => {
    const raw = {
      type: "assistant",
      timestamp: "2026-02-23T17:49:01.452Z",
      message: {
        role: "assistant",
        model: "claude-opus-4-6",
        content: [{ type: "text", text: "Here is the answer." }],
      },
    }
    const entries = parseEntry(raw, project, session, undefined)
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe("response")
    expect(entries[0].content).toBe("Here is the answer.")
    expect(entries[0].model).toBe("claude-opus-4-6")
  })

  it("parses an assistant tool_use block", () => {
    const raw = {
      type: "assistant",
      timestamp: "2026-02-23T17:49:01.527Z",
      message: {
        role: "assistant",
        model: "claude-opus-4-6",
        content: [
          {
            type: "tool_use",
            name: "Bash",
            input: { command: "ls -la" },
          },
        ],
      },
    }
    const entries = parseEntry(raw, project, session, undefined)
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe("tool_use")
    expect(entries[0].content).toBe("Bash: ls -la")
  })

  it("parses tool_use with file_path input", () => {
    const raw = {
      type: "assistant",
      timestamp: "2026-02-23T17:49:01.527Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            name: "Read",
            input: { file_path: "/foo/bar.ts" },
          },
        ],
      },
    }
    const entries = parseEntry(raw, project, session, undefined)
    expect(entries[0].content).toBe("Read: /foo/bar.ts")
  })

  it("parses a user tool_result", () => {
    const raw = {
      type: "user",
      timestamp: "2026-02-23T17:49:01.529Z",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            content: "File created successfully",
            tool_use_id: "toolu_abc",
          },
        ],
      },
    }
    const entries = parseEntry(raw, project, session, undefined)
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe("tool_result")
    expect(entries[0].content).toBe("File created successfully")
  })

  it("expands multiple content blocks into separate entries", () => {
    const raw = {
      type: "assistant",
      timestamp: "2026-02-23T17:49:01.452Z",
      message: {
        role: "assistant",
        model: "claude-opus-4-6",
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", name: "Glob", input: { pattern: "*.ts" } },
        ],
      },
    }
    const entries = parseEntry(raw, project, session, undefined)
    expect(entries).toHaveLength(2)
    expect(entries[0].type).toBe("response")
    expect(entries[1].type).toBe("tool_use")
  })

  it("skips thinking blocks", () => {
    const raw = {
      type: "assistant",
      timestamp: "2026-02-23T17:49:01.452Z",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "hmm let me think..." },
          { type: "text", text: "Here's my answer." },
        ],
      },
    }
    const entries = parseEntry(raw, project, session, undefined)
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe("response")
  })

  it("skips non-user/assistant entry types", () => {
    const raw = {
      type: "progress",
      timestamp: "2026-02-23T17:49:01.452Z",
      message: { role: "assistant", content: "stuff" },
    }
    expect(parseEntry(raw, project, session, undefined)).toHaveLength(0)
  })

  it("skips entries without a timestamp", () => {
    const raw = {
      type: "user",
      message: { role: "user", content: "hello" },
    }
    expect(parseEntry(raw, project, session, undefined)).toHaveLength(0)
  })
})

function makeEntry(overrides: Partial<FeedEntry> = {}): FeedEntry {
  return {
    timestamp: new Date().toISOString(),
    project: "test-project",
    session: "session-1",
    type: "prompt",
    model: undefined,
    content: "hello",
    raw: {},
    ...overrides,
  }
}

describe("formatRelativeTime", () => {
  it("returns 'just now' for times less than 60 seconds ago", () => {
    const now = new Date()
    expect(formatRelativeTime(now)).toBe("just now")
    expect(formatRelativeTime(new Date(now.getTime() - 30_000))).toBe("just now")
  })

  it("returns minutes ago for times between 1 and 59 minutes", () => {
    const threeMinAgo = new Date(Date.now() - 3 * 60_000)
    expect(formatRelativeTime(threeMinAgo)).toBe("3m ago")
  })

  it("returns hours ago for times 60+ minutes", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000)
    expect(formatRelativeTime(twoHoursAgo)).toBe("2h ago")
  })
})

describe("deriveSessions", () => {
  it("groups entries by session correctly", () => {
    const entries = [
      makeEntry({ session: "s1", timestamp: new Date().toISOString() }),
      makeEntry({ session: "s1", timestamp: new Date(Date.now() - 1000).toISOString() }),
      makeEntry({ session: "s2", timestamp: new Date().toISOString() }),
    ]
    const sessions = deriveSessions(entries)
    expect(sessions).toHaveLength(2)
    const s1 = sessions.find((s) => s.sessionId === "s1")
    expect(s1?.entryCount).toBe(2)
  })

  it("filters to today's sessions only", () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const entries = [
      makeEntry({ session: "today", timestamp: new Date().toISOString() }),
      makeEntry({ session: "yesterday", timestamp: yesterday.toISOString() }),
    ]
    const sessions = deriveSessions(entries)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].sessionId).toBe("today")
  })

  it("sorts by last activity descending", () => {
    const earlier = new Date(Date.now() - 60_000)
    const later = new Date()

    const entries = [
      makeEntry({ session: "s-early", timestamp: earlier.toISOString() }),
      makeEntry({ session: "s-late", timestamp: later.toISOString() }),
    ]
    const sessions = deriveSessions(entries)
    expect(sessions[0].sessionId).toBe("s-late")
    expect(sessions[1].sessionId).toBe("s-early")
  })

  it("returns empty array when no entries match today", () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const entries = [
      makeEntry({ session: "old", timestamp: yesterday.toISOString() }),
    ]
    expect(deriveSessions(entries)).toHaveLength(0)
  })

  it("uses the first entry's project as the session project", () => {
    const entries = [
      makeEntry({ session: "s1", project: "newest-project", timestamp: new Date().toISOString() }),
      makeEntry({ session: "s1", project: "older-project", timestamp: new Date(Date.now() - 1000).toISOString() }),
    ]
    const sessions = deriveSessions(entries)
    expect(sessions[0].project).toBe("newest-project")
  })
})

describe("loadAllSessions", () => {
  it("loads entries from real session files and returns sorted results", async () => {
    const { entries, projects } = await loadAllSessions()

    expect(projects.length).toBeGreaterThan(0)
    expect(entries.length).toBeGreaterThan(0)

    // Entries should be sorted newest-first
    for (let i = 1; i < Math.min(entries.length, 50); i++) {
      const prev = new Date(entries[i - 1].timestamp).getTime()
      const curr = new Date(entries[i].timestamp).getTime()
      expect(prev).toBeGreaterThanOrEqual(curr)
    }

    // Every entry should have required fields
    entries.slice(0, 20).forEach((entry) => {
      expect(entry.timestamp).toBeTruthy()
      expect(entry.project).toBeTruthy()
      expect(entry.session).toBeTruthy()
      expect(["prompt", "response", "tool_use", "tool_result"]).toContain(
        entry.type
      )
      expect(entry.content).toBeDefined()
    })
  })
})
