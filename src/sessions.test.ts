import { describe, it, expect } from "vitest"
import { homedir } from "node:os"
import {
  truncate,
  projectNameFromDir,
  parseEntry,
  toolCallDescription,
  loadAllSessions,
  deriveSessions,
  formatRelativeTime,
  extractPendingAction,
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
  it("strips the home directory prefix and keeps the rest as-is", () => {
    const encoded = homedir().replaceAll("/", "-")
    expect(projectNameFromDir(`${encoded}-claude-feed`)).toBe("~/claude-feed")
    expect(projectNameFromDir(`${encoded}-editor-configs`)).toBe(
      "~/editor-configs"
    )
  })

  it("preserves hyphens in nested path names", () => {
    const encoded = homedir().replaceAll("/", "-")
    expect(
      projectNameFromDir(`${encoded}-deliberations-public-will-weekly`)
    ).toBe("~/deliberations-public-will-weekly")
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
    cwd: undefined,
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

  it("uses the last two conversation lines as the preview", () => {
    const entries = [
      makeEntry({ session: "s1", type: "prompt", content: "latest prompt", timestamp: new Date().toISOString() }),
      makeEntry({ session: "s1", type: "response", content: "a response", timestamp: new Date(Date.now() - 1000).toISOString() }),
      makeEntry({ session: "s1", type: "prompt", content: "older prompt", timestamp: new Date(Date.now() - 2000).toISOString() }),
    ]
    const sessions = deriveSessions(entries)
    expect(sessions[0].preview).toEqual([
      { label: "Claude", text: "a response" },
      { label: "User", text: "latest prompt" },
    ])
  })

  it("flattens newlines in preview text", () => {
    const entries = [
      makeEntry({ session: "s1", type: "prompt", content: "line one\nline two\nline three", timestamp: new Date().toISOString() }),
      makeEntry({ session: "s1", type: "response", content: "hello\n\nworld", timestamp: new Date(Date.now() - 1000).toISOString() }),
    ]
    const sessions = deriveSessions(entries)
    expect(sessions[0].preview).toEqual([
      { label: "Claude", text: "hello world" },
      { label: "User", text: "line one line two line three" },
    ])
  })

  it("returns empty preview when session has no prompts or responses", () => {
    const entries = [
      makeEntry({ session: "s1", type: "tool_use", content: "some tool", timestamp: new Date().toISOString() }),
    ]
    const sessions = deriveSessions(entries)
    expect(sessions[0].preview).toEqual([])
  })

  it("derives 'thinking' status when newest entry is a user message", () => {
    const entries = [
      makeEntry({
        session: "s1",
        timestamp: new Date().toISOString(),
        raw: { type: "user", timestamp: new Date().toISOString(), message: { role: "user", content: "do something" } },
      }),
    ]
    const sessions = deriveSessions(entries)
    expect(sessions[0].status).toBe("thinking")
  })

  it("derives 'waiting' status when newest assistant message contains tool_use blocks", () => {
    const entries = [
      makeEntry({
        session: "s1",
        type: "tool_use",
        timestamp: new Date().toISOString(),
        raw: {
          type: "assistant",
          timestamp: new Date().toISOString(),
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "Let me check." },
              { type: "tool_use", name: "Bash", input: { command: "ls" } },
            ],
          },
        },
      }),
    ]
    const sessions = deriveSessions(entries)
    expect(sessions[0].status).toBe("waiting")
    expect(sessions[0].pendingAction).toEqual({ kind: "tool", description: "Bash: ls" })
  })

  it("extracts pendingAction question when waiting on AskUserQuestion", () => {
    const entries = [
      makeEntry({
        session: "s1",
        type: "tool_use",
        timestamp: new Date().toISOString(),
        raw: {
          type: "assistant",
          timestamp: new Date().toISOString(),
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                name: "AskUserQuestion",
                input: {
                  questions: [
                    {
                      question: "Which database?",
                      options: [
                        { label: "PostgreSQL", description: "Relational DB" },
                        { label: "MongoDB", description: "Document DB" },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
    ]
    const sessions = deriveSessions(entries)
    expect(sessions[0].status).toBe("waiting")
    expect(sessions[0].pendingAction).toEqual({
      kind: "question",
      question: "Which database?",
      options: [
        { label: "PostgreSQL", description: "Relational DB" },
        { label: "MongoDB", description: "Document DB" },
      ],
    })
  })

  it("falls back to idle when session entry is stale and no mtime provided", () => {
    const staleTime = new Date(Date.now() - 10 * 60_000).toISOString()
    const entries = [
      makeEntry({
        session: "s1",
        timestamp: staleTime,
        raw: { type: "user", timestamp: staleTime, message: { role: "user", content: "do something" } },
      }),
    ]
    const sessions = deriveSessions(entries)
    expect(sessions[0].status).toBe("idle")
  })

  it("keeps 'thinking' status when session entry is stale but file mtime is recent", () => {
    const staleTime = new Date(Date.now() - 10 * 60_000).toISOString()
    const entries = [
      makeEntry({
        session: "s1",
        timestamp: staleTime,
        raw: { type: "user", timestamp: staleTime, message: { role: "user", content: "do something" } },
      }),
    ]
    const mtimes = new Map([["s1", new Date()]])
    const sessions = deriveSessions(entries, mtimes)
    expect(sessions[0].status).toBe("thinking")
  })

  it("keeps 'waiting' status when session entry is stale but file mtime is recent", () => {
    const staleTime = new Date(Date.now() - 10 * 60_000).toISOString()
    const entries = [
      makeEntry({
        session: "s1",
        type: "tool_use",
        timestamp: staleTime,
        raw: {
          type: "assistant",
          timestamp: staleTime,
          message: {
            role: "assistant",
            content: [
              { type: "tool_use", name: "Bash", input: { command: "ls" } },
            ],
          },
        },
      }),
    ]
    const mtimes = new Map([["s1", new Date()]])
    const sessions = deriveSessions(entries, mtimes)
    expect(sessions[0].status).toBe("waiting")
  })

  it("derives 'idle' status when newest assistant message has only text blocks", () => {
    const entries = [
      makeEntry({
        session: "s1",
        type: "response",
        timestamp: new Date().toISOString(),
        raw: {
          type: "assistant",
          timestamp: new Date().toISOString(),
          message: { role: "assistant", content: [{ type: "text", text: "done" }] },
        },
      }),
    ]
    const sessions = deriveSessions(entries)
    expect(sessions[0].status).toBe("idle")
  })
})

describe("toolCallDescription", () => {
  it("generates description for Bash with command input", () => {
    expect(toolCallDescription("Bash", { command: "ls -la" })).toBe("Bash: ls -la")
  })

  it("generates description for Read with file_path input", () => {
    expect(toolCallDescription("Read", { file_path: "/foo/bar.ts" })).toBe(
      "Read: /foo/bar.ts"
    )
  })

  it("generates description for Glob with pattern input", () => {
    expect(toolCallDescription("Glob", { pattern: "*.ts" })).toBe("Glob: *.ts")
  })

  it("returns just the name when no recognized input fields", () => {
    expect(toolCallDescription("CustomTool", { something: "else" })).toBe(
      "CustomTool"
    )
  })

  it("returns just the name when input is undefined", () => {
    expect(toolCallDescription("Bash", undefined)).toBe("Bash")
  })
})

describe("extractPendingAction", () => {
  it("returns question action from AskUserQuestion input", () => {
    const content = [
      {
        type: "tool_use",
        name: "AskUserQuestion",
        input: {
          questions: [
            {
              question: "Which framework?",
              options: [
                { label: "React", description: "Component-based UI" },
                { label: "Vue", description: "Progressive framework" },
              ],
            },
          ],
        },
      },
    ]
    expect(extractPendingAction(content)).toEqual({
      kind: "question",
      question: "Which framework?",
      options: [
        { label: "React", description: "Component-based UI" },
        { label: "Vue", description: "Progressive framework" },
      ],
    })
  })

  it("returns tool action for non-AskUserQuestion tool calls", () => {
    const content = [
      { type: "tool_use", name: "Bash", input: { command: "ls" } },
    ]
    expect(extractPendingAction(content)).toEqual({ kind: "tool", description: "Bash: ls" })
  })

  it("returns undefined for non-array content", () => {
    expect(extractPendingAction("just a string")).toBeUndefined()
    expect(extractPendingAction(undefined)).toBeUndefined()
  })

  it("falls back to tool action when AskUserQuestion has no options", () => {
    const content = [
      {
        type: "tool_use",
        name: "AskUserQuestion",
        input: { questions: [{ question: "Pick one" }] },
      },
    ]
    expect(extractPendingAction(content)).toEqual({ kind: "tool", description: "AskUserQuestion: Pick one" })
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
