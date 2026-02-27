import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { FeedEntry, SessionSummary, SessionStatus, PendingAction } from "./types.js";

const CLAUDE_DIR = join(homedir(), ".claude", "projects");
const SUBAGENT_PATTERN = /subagent/i;

export function truncate(text: string, max = 2000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block: Record<string, unknown>) => block["type"] === "text")
    .map((block: Record<string, unknown>) => block["text"] as string)
    .join("\n");
}

export function toolCallDescription(
  name: string,
  input: Record<string, unknown> | undefined,
): string {
  let preview = name;
  if (input) {
    if (input["command"]) preview += `: ${input["command"]}`;
    else if (input["file_path"]) preview += `: ${input["file_path"]}`;
    else if (input["pattern"]) preview += `: ${input["pattern"]}`;
    else if (input["query"]) preview += `: ${input["query"]}`;
    else if (input["prompt"]) preview += `: ${String(input["prompt"]).slice(0, 80)}`;
    else if (Array.isArray(input["questions"])) {
      const q = (input["questions"] as Array<Record<string, unknown>>)[0];
      if (q?.["question"]) preview += `: ${String(q["question"]).slice(0, 120)}`;
    }
  }
  return preview;
}

export function parseEntry(
  raw: Record<string, unknown>,
  project: string,
  session: string,
  cwd: string | undefined,
): FeedEntry[] {
  const entries: FeedEntry[] = [];
  const type = raw["type"] as string;
  const timestamp = raw["timestamp"] as string;
  const message = raw["message"] as Record<string, unknown> | undefined;

  if (!message || !timestamp) return entries;
  if (type !== "user" && type !== "assistant") return entries;

  const role = message["role"] as string;
  const content = message["content"];
  const model = (message["model"] as string) || undefined;

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
        raw,
      });
    } else if (Array.isArray(content)) {
      content.forEach((block: Record<string, unknown>) => {
        if (block["type"] === "tool_result") {
          const resultContent = block["content"];
          const text =
            typeof resultContent === "string"
              ? resultContent
              : extractTextContent(resultContent);
          if (text) {
            entries.push({
              timestamp,
              project,
              session,
              cwd,
              type: "tool_result",
              model: undefined,
              content: truncate(text),
              raw,
            });
          }
        }
      });
    }
  }

  if (role === "assistant" && Array.isArray(content)) {
    content.forEach((block: Record<string, unknown>) => {
      if (block["type"] === "text") {
        const text = block["text"] as string;
        if (text) {
          entries.push({
            timestamp,
            project,
            session,
            cwd,
            type: "response",
            model,
            content: truncate(text),
            raw,
          });
        }
      } else if (block["type"] === "tool_use") {
        const toolName = block["name"] as string;
        const toolInput = block["input"] as Record<string, unknown> | undefined;
        const desc = toolCallDescription(toolName, toolInput);
        entries.push({
          timestamp,
          project,
          session,
          cwd,
          type: "tool_use",
          model,
          content: truncate(desc),
          raw,
        });
      }
    });
  }

  return entries;
}

async function parseSessionFile(
  filePath: string,
  project: string,
): Promise<{ entries: FeedEntry[]; mtime: Date }> {
  const session = basename(filePath, ".jsonl");
  const [text, fileStat] = await Promise.all([readFile(filePath, "utf-8"), stat(filePath)]);
  const entries: FeedEntry[] = [];
  let cwd: string | undefined;

  text.split("\n").forEach((line) => {
    if (!line.trim()) return;
    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      if (!cwd && typeof raw["cwd"] === "string") {
        cwd = raw["cwd"];
      }
      entries.push(...parseEntry(raw, project, session, cwd));
    } catch {
      // Skip malformed lines
    }
  });

  return { entries, mtime: fileStat.mtime };
}

export function projectDirForWorktree(worktreePath: string): string {
  // Claude encodes absolute paths with "/" replaced by "-"
  return worktreePath.replaceAll("/", "-");
}

export async function loadWorktreeSessions(worktreePath: string): Promise<{
  entries: FeedEntry[];
  mtimes: Map<string, Date>;
}> {
  const dirName = projectDirForWorktree(worktreePath);
  const dirPath = join(CLAUDE_DIR, dirName);
  const home = homedir();
  const project = worktreePath.startsWith(home)
    ? "~" + worktreePath.slice(home.length)
    : worktreePath;

  const files = await readdir(dirPath).catch((): string[] => []);
  const jsonlFiles = files.filter(
    (f) => f.endsWith(".jsonl") && !SUBAGENT_PATTERN.test(f),
  );

  const allEntries: FeedEntry[] = [];
  const mtimes = new Map<string, Date>();

  const fileResults = await Promise.all(
    jsonlFiles.map((f) => parseSessionFile(join(dirPath, f), project)),
  );

  fileResults.forEach(({ entries, mtime }) => {
    allEntries.push(...entries);
    if (entries.length > 0) {
      mtimes.set(entries[0]!.session, mtime);
    }
  });

  allEntries.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return { entries: allEntries, mtimes };
}

export function formatModelName(raw: string): string {
  const match = raw.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (match) {
    const name = match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1);
    return `${name} ${match[2]}.${match[3]}`;
  }
  return raw;
}

export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function extractPendingAction(messageContent: unknown): PendingAction | undefined {
  if (!Array.isArray(messageContent)) return undefined;
  const toolUse = [...messageContent]
    .reverse()
    .find((block: Record<string, unknown>) => block["type"] === "tool_use") as Record<string, unknown> | undefined;
  if (!toolUse) return undefined;

  const name = toolUse["name"] as string;
  const input = toolUse["input"] as Record<string, unknown> | undefined;

  if (name === "AskUserQuestion" && input && Array.isArray(input["questions"])) {
    const q = (input["questions"] as Array<Record<string, unknown>>)[0];
    if (q?.["question"] && Array.isArray(q["options"])) {
      return {
        kind: "question",
        question: String(q["question"]),
        options: (q["options"] as Array<Record<string, unknown>>).map((opt) => ({
          label: String(opt["label"] ?? ""),
          description: String(opt["description"] ?? ""),
        })),
      };
    }
  }

  return { kind: "tool", description: toolCallDescription(name, input) };
}

function extractSessionMeta(group: FeedEntry[]): {
  model: string | undefined;
  gitBranch: string | undefined;
} {
  let model: string | undefined;
  let gitBranch: string | undefined;

  for (const entry of group) {
    const raw = entry.raw;
    if (!gitBranch && typeof raw["gitBranch"] === "string") {
      gitBranch = raw["gitBranch"];
    }

    const message = raw["message"] as Record<string, unknown> | undefined;
    if (!model && message?.["model"]) {
      model = message["model"] as string;
    }

    if (model && gitBranch) break;
  }

  return { model, gitBranch };
}

export function deriveWorktreeSessions(
  entries: FeedEntry[],
  mtimes: Map<string, Date>,
): SessionSummary[] {
  const groups = entries.reduce((map, entry) => {
    const group = map.get(entry.session);
    if (group) {
      group.push(entry);
    } else {
      map.set(entry.session, [entry]);
    }
    return map;
  }, new Map<string, FeedEntry[]>());

  const now = new Date();
  const summaries: SessionSummary[] = [];

  groups.forEach((group, sessionId) => {
    const newest = group[0]!;
    const lastActivityAt = new Date(newest.timestamp);
    const { model, gitBranch } = extractSessionMeta(group);

    const rawType = newest.raw["type"] as string;
    const messageContent = (newest.raw["message"] as Record<string, unknown> | undefined)?.["content"];

    const mtime = mtimes.get(sessionId);
    const fileActive = mtime ? (now.getTime() - mtime.getTime()) < 10_000 : false;
    const ageMs = now.getTime() - lastActivityAt.getTime();
    const recentEntry = ageMs < 5 * 60_000;

    let status: SessionStatus = "idle";
    if ((fileActive || recentEntry) && rawType === "user") {
      status = "thinking";
    } else if (
      (fileActive || recentEntry) &&
      Array.isArray(messageContent) &&
      messageContent.some((block: Record<string, unknown>) => block["type"] === "tool_use")
    ) {
      status = "waiting";
    }

    const flattenPreview = (text: string) => text.replace(/\n+/g, " ").trim();
    const lastPrompt = group.find((e) => e.type === "prompt");
    const lastClaudeLine = status === "waiting"
      ? group.find((e) => e.type === "tool_use")
      : group.find((e) => e.type === "response");
    const preview = [lastPrompt, lastClaudeLine]
      .filter((e): e is FeedEntry => e !== undefined)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((e) => ({
        label: e.type === "prompt" ? "User" : "Claude",
        text: flattenPreview(e.content),
      }));

    summaries.push({
      sessionId,
      project: newest.project,
      cwd: newest.cwd,
      lastActivityAt,
      entryCount: group.length,
      preview,
      model,
      gitBranch,
      status,
      pendingAction: status === "waiting" ? extractPendingAction(messageContent) : undefined,
    });
  });

  summaries.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());

  return summaries;
}
