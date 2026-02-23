import { readdir, readFile } from "node:fs/promises"
import { join, basename } from "node:path"
import { homedir } from "node:os"
import { FeedEntry, EntryType, SessionSummary, ThreadItem } from "./types.js"

export const CLAUDE_DIR = join(homedir(), ".claude", "projects")
const SUBAGENT_PATTERN = /subagent/i

export function truncate(text: string, max = 200): string {
  if (text.length <= max) return text
  return text.slice(0, max) + "…"
}

export function projectNameFromDir(dirName: string): string {
  // Dir names look like "-Users-cquinones-editor-configs"
  // Extract the last segment as the project name
  const parts = dirName.split("-").filter(Boolean)
  // Skip leading path segments (Users, username) — take last meaningful segment(s)
  // The dir name encodes the full path, so we grab everything after the username
  const userIdx = parts.indexOf("Users")
  if (userIdx !== -1 && userIdx + 2 < parts.length) {
    return parts.slice(userIdx + 2).join("-")
  }
  return dirName
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .filter((block: Record<string, unknown>) => block.type === "text")
    .map((block: Record<string, unknown>) => block.text as string)
    .join("\n")
}

export function toolCallDescription(
  name: string,
  input: Record<string, unknown> | undefined
): string {
  let preview = name
  if (input) {
    if (input.command) preview += `: ${input.command}`
    else if (input.file_path) preview += `: ${input.file_path}`
    else if (input.pattern) preview += `: ${input.pattern}`
    else if (input.query) preview += `: ${input.query}`
    else if (input.prompt) preview += `: ${String(input.prompt).slice(0, 80)}`
  }
  return preview
}

export function parseEntry(
  raw: Record<string, unknown>,
  project: string,
  session: string,
  cwd: string | undefined
): FeedEntry[] {
  const entries: FeedEntry[] = []
  const type = raw.type as string
  const timestamp = raw.timestamp as string
  const message = raw.message as Record<string, unknown> | undefined

  if (!message || !timestamp) return entries
  if (type !== "user" && type !== "assistant") return entries

  const role = message.role as string
  const content = message.content
  const model = (message.model as string) || undefined

  if (role === "user") {
    if (typeof content === "string") {
      entries.push({
        timestamp,
        project,
        session,
        cwd,
        type: "prompt",
        model: undefined,
        content: truncate(content),
        raw: raw,
      })
    } else if (Array.isArray(content)) {
      content.forEach((block: Record<string, unknown>) => {
        if (block.type === "tool_result") {
          const resultContent = block.content
          const text =
            typeof resultContent === "string"
              ? resultContent
              : extractTextContent(resultContent)
          if (text) {
            entries.push({
              timestamp,
              project,
              session,
              cwd,
              type: "tool_result",
              model: undefined,
              content: truncate(text),
              raw: raw,
            })
          }
        }
      })
    }
  }

  if (role === "assistant" && Array.isArray(content)) {
    content.forEach((block: Record<string, unknown>) => {
      if (block.type === "text") {
        const text = block.text as string
        if (text) {
          entries.push({
            timestamp,
            project,
            session,
            cwd,
            type: "response",
            model,
            content: truncate(text),
            raw: raw,
          })
        }
      } else if (block.type === "tool_use") {
        const name = block.name as string
        const input = block.input as Record<string, unknown> | undefined
        const preview = toolCallDescription(name, input)
        entries.push({
          timestamp,
          project,
          session,
          cwd,
          type: "tool_use",
          model,
          content: truncate(preview),
          raw: raw,
        })
      }
      // Skip thinking blocks
    })
  }

  return entries
}

async function parseSessionFile(
  filePath: string,
  project: string
): Promise<FeedEntry[]> {
  const session = basename(filePath, ".jsonl")
  const text = await readFile(filePath, "utf-8")
  const entries: FeedEntry[] = []
  let cwd: string | undefined

  text.split("\n").forEach((line) => {
    if (!line.trim()) return
    try {
      const raw = JSON.parse(line) as Record<string, unknown>
      if (!cwd && typeof raw.cwd === "string") {
        cwd = raw.cwd
      }
      entries.push(...parseEntry(raw, project, session, cwd))
    } catch {
      // Skip malformed lines
    }
  })

  return entries
}

export async function loadAllSessions(): Promise<{
  entries: FeedEntry[]
  projects: string[]
}> {
  const projectDirs = await readdir(CLAUDE_DIR).catch((): string[] => [])
  const allEntries: FeedEntry[] = []
  const projectSet = new Set<string>()

  await Promise.all(
    projectDirs.map(async (dirName) => {
      const dirPath = join(CLAUDE_DIR, dirName)
      const project = projectNameFromDir(dirName)
      projectSet.add(project)

      const files = await readdir(dirPath).catch((): string[] => [])
      const jsonlFiles = files.filter(
        (f) => f.endsWith(".jsonl") && !SUBAGENT_PATTERN.test(f)
      )

      const fileEntries = await Promise.all(
        jsonlFiles.map((f) => parseSessionFile(join(dirPath, f), project))
      )
      fileEntries.forEach((entries) => allEntries.push(...entries))
    })
  )

  allEntries.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return {
    entries: allEntries,
    projects: [...projectSet].sort(),
  }
}

export function formatModelName(raw: string): string {
  // "claude-opus-4-6" → "Opus 4.6"
  // "claude-sonnet-4-6" → "Sonnet 4.6"
  // "claude-haiku-4-5-20251001" → "Haiku 4.5"
  const match = raw.match(/claude-(\w+)-(\d+)-(\d+)/)
  if (match) {
    const name = match[1].charAt(0).toUpperCase() + match[1].slice(1)
    return `${name} ${match[2]}.${match[3]}`
  }
  return raw
}

function extractSessionMeta(group: FeedEntry[]): {
  model: string | undefined
  gitBranch: string | undefined
} {
  let model: string | undefined
  let gitBranch: string | undefined

  // Walk newest-first to find the latest values
  for (const entry of group) {
    const raw = entry.raw
    if (!gitBranch && typeof raw.gitBranch === "string") {
      gitBranch = raw.gitBranch
    }

    const message = raw.message as Record<string, unknown> | undefined
    if (!model && message?.model) {
      model = message.model as string
    }

    if (model && gitBranch) break
  }

  return { model, gitBranch }
}

export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return "just now"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  return `${diffHr}h ago`
}

export function deriveSessions(entries: FeedEntry[]): SessionSummary[] {
  const groups = entries.reduce((map, entry) => {
    const group = map.get(entry.session)
    if (group) {
      group.push(entry)
    } else {
      map.set(entry.session, [entry])
    }
    return map
  }, new Map<string, FeedEntry[]>())

  const now = new Date()
  const todayYear = now.getFullYear()
  const todayMonth = now.getMonth()
  const todayDay = now.getDate()

  const summaries: SessionSummary[] = []

  groups.forEach((group, sessionId) => {
    // Entries are already sorted newest-first, so first entry has the latest timestamp
    const newest = group[0]
    const lastActivityAt = new Date(newest.timestamp)

    if (
      lastActivityAt.getFullYear() === todayYear &&
      lastActivityAt.getMonth() === todayMonth &&
      lastActivityAt.getDate() === todayDay
    ) {
      const flattenPreview = (text: string) => text.replace(/\n+/g, " ").trim()
      const conversational = group.filter((e) => e.type === "prompt" || e.type === "response")
      const lastTwo = conversational.slice(0, 2).reverse()
      const preview = lastTwo.map((e) => ({
        label: e.type === "prompt" ? "User" : "Claude",
        text: flattenPreview(e.content),
      }))

      const { model, gitBranch } = extractSessionMeta(group)

      summaries.push({
        sessionId,
        project: newest.project,
        cwd: newest.cwd,
        lastActivityAt,
        entryCount: group.length,
        preview,
        model,
        gitBranch,
      })
    }
  })

  summaries.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())

  return summaries
}

export function parseSessionThread(lines: Record<string, unknown>[]): ThreadItem[] {
  const items: ThreadItem[] = []
  const pendingTools = new Map<string, ThreadItem & { kind: "tool" }>()

  lines.forEach((raw) => {
    const type = raw.type as string
    const timestamp = raw.timestamp as string
    const message = raw.message as Record<string, unknown> | undefined

    if (!message || !timestamp) return
    if (type !== "user" && type !== "assistant") return

    const role = message.role as string
    const content = message.content
    const model = (message.model as string) || undefined

    if (role === "user") {
      if (typeof content === "string") {
        items.push({ kind: "prompt", timestamp, text: content })
      } else if (Array.isArray(content)) {
        content.forEach((block: Record<string, unknown>) => {
          if (block.type === "tool_result") {
            const toolUseId = block.tool_use_id as string
            const pending = pendingTools.get(toolUseId)
            if (pending) {
              const resultContent = block.content
              pending.result =
                typeof resultContent === "string"
                  ? resultContent
                  : extractTextContent(resultContent)
              pending.isError = block.is_error === true
              pendingTools.delete(toolUseId)
            }
          }
        })
      }
    }

    if (role === "assistant" && Array.isArray(content)) {
      content.forEach((block: Record<string, unknown>) => {
        if (block.type === "text") {
          const text = block.text as string
          if (text) {
            items.push({ kind: "text", timestamp, text, model })
          }
        } else if (block.type === "tool_use") {
          const name = block.name as string
          const input = block.input as Record<string, unknown> | undefined
          const id = block.id as string
          const item: ThreadItem & { kind: "tool" } = {
            kind: "tool",
            timestamp,
            name,
            description: toolCallDescription(name, input),
            result: "",
            isError: false,
          }
          items.push(item)
          if (id) {
            pendingTools.set(id, item)
          }
        }
        // Skip thinking blocks
      })
    }
  })

  return items
}

export async function loadSessionThread(sessionId: string): Promise<ThreadItem[]> {
  const projectDirs = await readdir(CLAUDE_DIR).catch((): string[] => [])

  for (const dirName of projectDirs) {
    const dirPath = join(CLAUDE_DIR, dirName)
    const files = await readdir(dirPath).catch((): string[] => [])
    const match = files.find((f) => f === `${sessionId}.jsonl`)
    if (!match) continue

    const text = await readFile(join(dirPath, match), "utf-8")
    const lines: Record<string, unknown>[] = []

    text.split("\n").forEach((line) => {
      if (!line.trim()) return
      try {
        lines.push(JSON.parse(line) as Record<string, unknown>)
      } catch {
        // Skip malformed lines
      }
    })

    return parseSessionThread(lines)
  }

  return []
}
