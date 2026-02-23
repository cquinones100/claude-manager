export type EntryType = "prompt" | "response" | "tool_use" | "tool_result"

export type FeedEntry = {
  timestamp: string
  project: string
  session: string
  cwd: string | undefined
  type: EntryType
  model: string | undefined
  content: string
  raw: Record<string, unknown>
}

export type ProjectFilter = {
  name: string
  selected: boolean
}

export type TypeFilter = {
  type: EntryType
  selected: boolean
}

export type SessionSummary = {
  sessionId: string
  project: string
  cwd: string | undefined
  lastActivityAt: Date
  entryCount: number
}

export type ResumeTarget = {
  sessionId: string
  cwd: string | undefined
}

export type View =
  | { kind: "grid" }
  | { kind: "feed"; sessionId: string }
