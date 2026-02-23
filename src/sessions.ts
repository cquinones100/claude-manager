import { readdir, readFile } from "node:fs/promises"
import { join, basename } from "node:path"
import { homedir } from "node:os"
import { FeedEntry, EntryType, SessionSummary } from "./types.js"

const CLAUDE_DIR = join(homedir(), ".claude", "projects")
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
        let preview = name
        if (input) {
          // Show relevant input fields for common tools
          if (input.command) preview += `: ${input.command}`
          else if (input.file_path) preview += `: ${input.file_path}`
          else if (input.pattern) preview += `: ${input.pattern}`
          else if (input.query) preview += `: ${input.query}`
          else if (input.prompt) preview += `: ${String(input.prompt).slice(0, 80)}`
        }
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
      summaries.push({
        sessionId,
        project: newest.project,
        cwd: newest.cwd,
        lastActivityAt,
        entryCount: group.length,
      })
    }
  })

  summaries.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())

  return summaries
}
