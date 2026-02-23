import { readFile, writeFile, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join, dirname } from "node:path"

const HIDDEN_PATH = join(homedir(), ".claude-feed", "hidden.json")

export async function loadHidden(): Promise<Set<string>> {
  try {
    const data = await readFile(HIDDEN_PATH, "utf-8")
    const ids: unknown = JSON.parse(data)
    if (Array.isArray(ids)) {
      return new Set(ids.filter((id): id is string => typeof id === "string"))
    }
    return new Set()
  } catch {
    return new Set()
  }
}

export async function addHidden(sessionId: string): Promise<void> {
  const current = await loadHidden()
  current.add(sessionId)
  await mkdir(dirname(HIDDEN_PATH), { recursive: true })
  await writeFile(HIDDEN_PATH, JSON.stringify([...current], null, 2) + "\n")
}
