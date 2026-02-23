export type EntryType = "prompt" | "response" | "tool_use" | "tool_result"

export type FeedEntry = {
  timestamp: string
  project: string
  session: string
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
