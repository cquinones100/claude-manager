import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, readdir } from "fs/promises";
import { homedir } from "os";
import { createReadStream } from "fs";
import { createInterface } from "readline";

const execFileAsync = promisify(execFile);

type ClaudeSession = {
  name: string;
  sessionId: string;
  sourceBranch: string;
  createdAt: number;
};

type Worktree = {
  path: string;
  head: string;
  branch: string | null;
  isBare: boolean;
  isLocked: boolean;
  claudeSession: ClaudeSession | null;
};

type ClaudeWorktreeEntry = {
  name: string;
  path: string;
  sessionId: string;
  baseRepo: string;
  branch: string;
  sourceBranch: string;
  createdAt: number;
};

type ClaudeWorktreesFile = {
  worktrees: Record<string, ClaudeWorktreeEntry>;
};

async function readClaudeWorktrees(): Promise<ClaudeWorktreeEntry[]> {
  const filePath = join(
    app.getPath("appData"),
    "Claude",
    "git-worktrees.json"
  );
  try {
    const raw = await readFile(filePath, "utf-8");
    const data: ClaudeWorktreesFile = JSON.parse(raw);
    return Object.values(data.worktrees);
  } catch {
    return [];
  }
}

function parseWorktrees(output: string): Worktree[] {
  return output
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.trim().split("\n");
      const worktree: Partial<Worktree> = { isBare: false, isLocked: false, branch: null, claudeSession: null };

      lines.forEach((line) => {
        if (line.startsWith("worktree ")) worktree.path = line.slice(9);
        else if (line.startsWith("HEAD ")) worktree.head = line.slice(5);
        else if (line.startsWith("branch ")) worktree.branch = line.slice(7).replace("refs/heads/", "");
        else if (line === "bare") worktree.isBare = true;
        else if (line === "locked") worktree.isLocked = true;
      });

      return worktree as Worktree;
    });
}

async function listWorktrees(projectPath: string): Promise<Worktree[]> {
  const [{ stdout }, claudeEntries] = await Promise.all([
    execFileAsync("git", ["worktree", "list", "--porcelain"], { cwd: projectPath }),
    readClaudeWorktrees(),
  ]);

  const worktrees = parseWorktrees(stdout);
  const claudeByPath = new Map(claudeEntries.map((e) => [e.path, e]));

  return worktrees.map((wt) => {
    const entry = claudeByPath.get(wt.path);
    return {
      ...wt,
      claudeSession: entry
        ? {
            name: entry.name,
            sessionId: entry.sessionId,
            sourceBranch: entry.sourceBranch,
            createdAt: entry.createdAt,
          }
        : null,
    };
  });
}

type SessionInfo = {
  sessionId: string;
  title: string | null;
  model: string | null;
  startedAt: string;
  lastActiveAt: string;
  isArchived: boolean;
  completedTurns: number;
  source: "desktop" | "cli";
};

type DesktopSessionFile = {
  sessionId: string;
  cliSessionId: string;
  cwd: string;
  worktreePath?: string;
  worktreeName?: string;
  sourceBranch?: string;
  createdAt: number;
  lastActivityAt: number;
  model: string;
  isArchived: boolean;
  title: string | null;
  completedTurns: number;
};

type DesktopSessionResult = {
  session: SessionInfo;
  cliSessionId: string;
};

async function listDesktopSessions(worktreePath: string): Promise<DesktopSessionResult[]> {
  const sessionsRoot = join(
    app.getPath("appData"),
    "Claude",
    "claude-code-sessions"
  );

  let windowDirs: string[];
  try {
    windowDirs = await readdir(sessionsRoot);
  } catch {
    return [];
  }

  const results: DesktopSessionResult[] = [];

  for (const windowDir of windowDirs) {
    const windowPath = join(sessionsRoot, windowDir);
    let projectDirs: string[];
    try {
      projectDirs = await readdir(windowPath);
    } catch {
      continue;
    }

    for (const projectDir of projectDirs) {
      const projectPath = join(windowPath, projectDir);
      let sessionFiles: string[];
      try {
        sessionFiles = (await readdir(projectPath)).filter((f) => f.endsWith(".json"));
      } catch {
        continue;
      }

      const entries = await Promise.all(
        sessionFiles.map(async (f) => {
          try {
            const raw = await readFile(join(projectPath, f), "utf-8");
            return JSON.parse(raw) as DesktopSessionFile;
          } catch {
            return null;
          }
        })
      );

      entries.forEach((entry) => {
        if (!entry) return;
        const matchesByCwd = entry.cwd === worktreePath;
        const matchesByWorktreePath = entry.worktreePath === worktreePath;
        if (!matchesByCwd && !matchesByWorktreePath) return;

        results.push({
          session: {
            sessionId: entry.sessionId,
            title: entry.title,
            model: entry.model,
            startedAt: new Date(entry.createdAt).toISOString(),
            lastActiveAt: new Date(entry.lastActivityAt).toISOString(),
            isArchived: entry.isArchived,
            completedTurns: entry.completedTurns,
            source: "desktop",
          },
          cliSessionId: entry.cliSessionId,
        });
      });
    }
  }

  return results;
}

function worktreePathToProjectDir(worktreePath: string): string {
  return worktreePath.replace(/[/.]/g, "-");
}

async function listCliSessions(worktreePath: string): Promise<SessionInfo[]> {
  const projectDir = join(
    homedir(),
    ".claude",
    "projects",
    worktreePathToProjectDir(worktreePath)
  );

  let files: string[];
  try {
    files = (await readdir(projectDir)).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return [];
  }

  const results = await Promise.all(
    files.map(async (f) => {
      const rl = createInterface({
        input: createReadStream(join(projectDir, f)),
        crlfDelay: Infinity,
      });

      let sessionId: string | null = null;
      let firstPrompt: string | null = null;
      let startedAt: string | null = null;
      let lastActiveAt: string | null = null;
      let messageCount = 0;

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.type === "file-history-snapshot") continue;

          if (!sessionId && entry.sessionId) sessionId = entry.sessionId;
          if (!startedAt && entry.timestamp) startedAt = entry.timestamp;
          if (entry.timestamp) lastActiveAt = entry.timestamp;

          if (entry.type === "user" && !entry.isMeta && entry.message?.content) {
            messageCount++;
            if (!firstPrompt) {
              const content = entry.message.content;
              firstPrompt =
                typeof content === "string" ? content.slice(0, 200) : "(complex message)";
            }
          } else if (entry.type === "assistant") {
            messageCount++;
          }
        } catch {
          // skip malformed lines
        }
      }

      if (!sessionId || !startedAt) return null;

      return {
        sessionId,
        title: firstPrompt,
        model: null,
        startedAt,
        lastActiveAt: lastActiveAt ?? startedAt,
        isArchived: false,
        completedTurns: messageCount,
        source: "cli" as const,
      };
    })
  );

  return results.filter((s): s is SessionInfo => s !== null);
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolUse: { name: string } | null;
};

async function findDesktopSessionMeta(sessionId: string): Promise<DesktopSessionFile | null> {
  const sessionsRoot = join(app.getPath("appData"), "Claude", "claude-code-sessions");
  let windowDirs: string[];
  try {
    windowDirs = await readdir(sessionsRoot);
  } catch {
    return null;
  }

  for (const windowDir of windowDirs) {
    const windowPath = join(sessionsRoot, windowDir);
    let projectDirs: string[];
    try {
      projectDirs = await readdir(windowPath);
    } catch {
      continue;
    }
    for (const projectDir of projectDirs) {
      const filePath = join(windowPath, projectDir, `${sessionId}.json`);
      try {
        const raw = await readFile(filePath, "utf-8");
        return JSON.parse(raw) as DesktopSessionFile;
      } catch {
        continue;
      }
    }
  }
  return null;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => block.text)
    .join("\n");
}

function extractToolUseFromContent(content: unknown): { name: string } | null {
  if (!Array.isArray(content)) return null;
  const toolBlock = content.find((block: { type: string }) => block.type === "tool_use");
  return toolBlock ? { name: toolBlock.name } : null;
}

async function readSessionMessages(jsonlPath: string): Promise<ChatMessage[]> {
  const rl = createInterface({
    input: createReadStream(jsonlPath),
    crlfDelay: Infinity,
  });

  const messages: ChatMessage[] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.isSidechain) continue;

      if (entry.type === "user" && !entry.isMeta && entry.message?.content) {
        const text = extractTextFromContent(entry.message.content);
        // Skip tool_result messages (automatic responses to tool use)
        const isToolResult =
          Array.isArray(entry.message.content) &&
          entry.message.content.some((b: { type: string }) => b.type === "tool_result");
        if (isToolResult || !text.trim()) continue;

        messages.push({
          role: "user",
          content: text,
          timestamp: entry.timestamp,
          toolUse: null,
        });
      } else if (entry.type === "assistant" && entry.message?.content) {
        const text = extractTextFromContent(entry.message.content);
        const toolUse = extractToolUseFromContent(entry.message.content);

        // Skip messages that are only thinking blocks
        if (!text.trim() && !toolUse) continue;

        messages.push({
          role: "assistant",
          content: text,
          timestamp: entry.timestamp,
          toolUse,
        });
      }
    } catch {
      // skip malformed lines
    }
  }

  return messages;
}

async function getSessionHistory(
  sessionId: string,
  worktreePath: string
): Promise<ChatMessage[]> {
  // For desktop sessions, resolve to the linked CLI session JSONL
  let cliSessionId = sessionId;
  let cwd = worktreePath;

  if (sessionId.startsWith("local_")) {
    const meta = await findDesktopSessionMeta(sessionId);
    if (meta) {
      cliSessionId = meta.cliSessionId;
      cwd = meta.cwd;
    }
  }

  const projectDir = join(
    homedir(),
    ".claude",
    "projects",
    worktreePathToProjectDir(cwd)
  );
  const jsonlPath = join(projectDir, `${cliSessionId}.jsonl`);

  try {
    return await readSessionMessages(jsonlPath);
  } catch {
    return [];
  }
}

async function listSessions(worktreePath: string): Promise<SessionInfo[]> {
  const [desktopResults, cliSessions] = await Promise.all([
    listDesktopSessions(worktreePath),
    listCliSessions(worktreePath),
  ]);

  const seen = new Set<string>();
  const all: SessionInfo[] = [];

  // Desktop sessions take priority; also mark their linked CLI session IDs as seen
  desktopResults.forEach(({ session, cliSessionId }) => {
    seen.add(session.sessionId);
    seen.add(cliSessionId);
    all.push(session);
  });

  cliSessions.forEach((s) => {
    if (!seen.has(s.sessionId)) all.push(s);
  });

  return all.sort(
    (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
  );
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

ipcMain.handle("worktrees:list", async (_event, projectPath: string) => {
  return listWorktrees(projectPath);
});

ipcMain.handle("sessions:list", async (_event, worktreePath: string) => {
  return listSessions(worktreePath);
});

ipcMain.handle(
  "sessions:history",
  async (_event, sessionId: string, worktreePath: string) => {
    return getSessionHistory(sessionId, worktreePath);
  }
);

ipcMain.handle("dialog:openDirectory", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
