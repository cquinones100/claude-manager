import { readFile, writeFile, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join, dirname } from "node:path"

const NAMES_PATH = join(homedir(), ".claude-feed", "names.json")

export async function loadNames(): Promise<Map<string, string>> {
  try {
    const data = await readFile(NAMES_PATH, "utf-8")
    const parsed: unknown = JSON.parse(data)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const map = new Map<string, string>()
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === "string") map.set(key, value)
      }
      return map
    }
    return new Map()
  } catch {
    return new Map()
  }
}

async function writeNames(names: Map<string, string>): Promise<void> {
  await mkdir(dirname(NAMES_PATH), { recursive: true })
  await writeFile(NAMES_PATH, JSON.stringify(Object.fromEntries(names), null, 2) + "\n")
}

export async function saveName(sessionId: string, name: string): Promise<void> {
  const current = await loadNames()
  current.set(sessionId, name)
  await writeNames(current)
}

export async function removeName(sessionId: string): Promise<void> {
  const current = await loadNames()
  current.delete(sessionId)
  await writeNames(current)
}
