import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, readdir, stat, access } from "fs/promises";
import { homedir } from "os";
import { createReadStream, watch, FSWatcher } from "fs";
import { createInterface } from "readline";

const execFileAsync = promisify(execFile);

function getClaudeAppDataDir(): string {
  return join(process.env.CLAUDE_APP_DATA_DIR || app.getPath("appData"), "Claude");
}

function getClaudeHomeDir(): string {
  return process.env.CLAUDE_HOME_DIR || join(homedir(), ".claude");
}

type ClaudeSession = {
  name: string;
  sessionId: string;
  sourceBranch: string;
  createdAt: number;
  title: string | null;
};

type Worktree = {
  path: string;
  head: string;
  branch: string | null;
  isBare: boolean;
  isLocked: boolean;
  claudeSession: ClaudeSession | null;
  sessionPreview: string | null;
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
  const filePath = join(getClaudeAppDataDir(), "git-worktrees.json");
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
      const worktree: Partial<Worktree> = { isBare: false, isLocked: false, branch: null, claudeSession: null, sessionPreview: null };

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

async function getAllDesktopSessionsByPath(): Promise<Map<string, DesktopSessionFile>> {
  const sessionsRoot = join(getClaudeAppDataDir(), "claude-code-sessions");
  const bestByPath = new Map<string, DesktopSessionFile>();

  let windowDirs: string[];
  try {
    windowDirs = await readdir(sessionsRoot);
  } catch {
    return bestByPath;
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
        if (!entry || !entry.title) return;

        // Index by both cwd and originCwd so base repos get matched too
        const keys = [entry.cwd];
        if (entry.originCwd && entry.originCwd !== entry.cwd) {
          keys.push(entry.originCwd);
        }

        keys.forEach((key) => {
          const existing = bestByPath.get(key);
          if (!existing || entry.lastActivityAt > existing.lastActivityAt) {
            bestByPath.set(key, entry);
          }
        });
      });
    }
  }

  return bestByPath;
}

async function listWorktrees(projectPath: string): Promise<Worktree[]> {
  const [{ stdout }, claudeEntries, desktopByPath] = await Promise.all([
    execFileAsync("git", ["worktree", "list", "--porcelain"], { cwd: projectPath }),
    readClaudeWorktrees(),
    getAllDesktopSessionsByPath(),
  ]);

  const worktrees = parseWorktrees(stdout);
  const claudeByPath = new Map(claudeEntries.map((e) => [e.path, e]));

  return worktrees.map((wt) => {
    const entry = claudeByPath.get(wt.path);
    const desktopSession = desktopByPath.get(wt.path);

    return {
      ...wt,
      sessionPreview: desktopSession?.title ?? null,
      claudeSession: entry
        ? {
            name: entry.name,
            sessionId: entry.sessionId,
            sourceBranch: entry.sourceBranch,
            createdAt: entry.createdAt,
            title: desktopSession?.title ?? null,
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
  originCwd?: string;
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
  const sessionsRoot = join(getClaudeAppDataDir(), "claude-code-sessions");

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
    getClaudeHomeDir(),
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
  const sessionsRoot = join(getClaudeAppDataDir(), "claude-code-sessions");
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
    getClaudeHomeDir(),
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

async function detectTerminal(): Promise<"iterm" | "terminal"> {
  try {
    await access("/Applications/iTerm.app");
    return "iterm";
  } catch {
    return "terminal";
  }
}

async function openInTerminal(worktreePath: string, sessionId: string | null): Promise<void> {
  const terminal = await detectTerminal();
  const resumeFlag = sessionId ? ` --resume ${sessionId}` : "";
  const command = `cd '${worktreePath.replace(/'/g, "'\\''")}' && claude${resumeFlag}`;

  const script =
    terminal === "iterm"
      ? `tell application "iTerm2"
           activate
           set newWindow to (create window with default profile)
           tell current session of newWindow
             write text "${command.replace(/"/g, '\\"')}"
           end tell
         end tell`
      : `tell application "Terminal"
           activate
           do script "${command.replace(/"/g, '\\"')}"
         end tell`;

  await execFileAsync("osascript", ["-e", script]);
}

async function resolveCliSessionId(sessionId: string): Promise<string | null> {
  if (!sessionId.startsWith("local_")) return sessionId;
  const meta = await findDesktopSessionMeta(sessionId);
  return meta?.cliSessionId ?? null;
}

async function openInDesktop(): Promise<void> {
  await shell.openExternal("claude://");
}

function createWindow(): void {
  const win = new BrowserWindow({
    title: "Worktree Viewer",
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

type CommitInfo = {
  sha: string;
  shortSha: string;
  subject: string;
  authorDate: string;
};

type BranchLine = {
  worktree: Worktree;
  mergeBaseSha: string;
  commits: CommitInfo[];
};

type WorktreeGraph = {
  defaultBranch: string;
  mainCommits: CommitInfo[];
  branches: BranchLine[];
};

function parseGitLog(output: string): CommitInfo[] {
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, shortSha, authorDate, ...subjectParts] = line.split("\t");
      return { sha, shortSha, authorDate, subject: subjectParts.join("\t") };
    });
}

async function detectDefaultBranch(projectPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD"],
      { cwd: projectPath }
    );
    return stdout.trim().replace("refs/remotes/origin/", "");
  } catch {
    // Fall back: check if main or master exists
    try {
      await execFileAsync("git", ["rev-parse", "--verify", "main"], { cwd: projectPath });
      return "main";
    } catch {
      try {
        await execFileAsync("git", ["rev-parse", "--verify", "master"], { cwd: projectPath });
        return "master";
      } catch {
        return "main";
      }
    }
  }
}

async function getWorktreeGraph(projectPath: string): Promise<WorktreeGraph> {
  const [worktrees, defaultBranch] = await Promise.all([
    listWorktrees(projectPath),
    detectDefaultBranch(projectPath),
  ]);

  const { stdout: logOutput } = await execFileAsync(
    "git",
    ["log", "--first-parent", "-n", "50", `--format=%H\t%h\t%aI\t%s`, defaultBranch],
    { cwd: projectPath }
  );
  const mainCommits = parseGitLog(logOutput);

  const nonMainWorktrees = worktrees.filter(
    (wt) => !wt.isBare && wt.branch !== defaultBranch
  );

  const branches = await Promise.all(
    nonMainWorktrees.map(async (wt) => {
      const ref = wt.branch ?? wt.head;
      try {
        const { stdout: mergeBaseOut } = await execFileAsync(
          "git",
          ["merge-base", defaultBranch, ref],
          { cwd: projectPath }
        );
        const mergeBaseSha = mergeBaseOut.trim();

        const { stdout: branchLog } = await execFileAsync(
          "git",
          ["log", "--first-parent", `--format=%H\t%h\t%aI\t%s`, `${mergeBaseSha}..${ref}`],
          { cwd: projectPath }
        );
        const commits = parseGitLog(branchLog);

        return { worktree: wt, mergeBaseSha, commits };
      } catch {
        return { worktree: wt, mergeBaseSha: "", commits: [] };
      }
    })
  );

  return { defaultBranch, mainCommits, branches };
}

type CommitDetail = {
  sha: string;
  shortSha: string;
  subject: string;
  body: string;
  authorName: string;
  authorDate: string;
};

async function getCommitDetail(projectPath: string, sha: string): Promise<CommitDetail> {
  const { stdout } = await execFileAsync(
    "git",
    ["show", "--no-patch", `--format=%H%n%h%n%s%n%aN%n%aI%n%b`, sha],
    { cwd: projectPath }
  );
  const lines = stdout.trimEnd().split("\n");
  return {
    sha: lines[0],
    shortSha: lines[1],
    subject: lines[2],
    authorName: lines[3],
    authorDate: lines[4],
    body: lines.slice(5).join("\n").trim(),
  };
}

ipcMain.handle("worktrees:list", async (_event, projectPath: string) => {
  return listWorktrees(projectPath);
});

ipcMain.handle("worktrees:graph", async (_event, projectPath: string) => {
  return getWorktreeGraph(projectPath);
});

ipcMain.handle("commits:detail", async (_event, projectPath: string, sha: string) => {
  return getCommitDetail(projectPath, sha);
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

ipcMain.handle(
  "session:openInTerminal",
  async (_event, sessionId: string, worktreePath: string) => {
    const cliId = await resolveCliSessionId(sessionId);
    await openInTerminal(worktreePath, cliId);
  }
);

ipcMain.handle("session:openInDesktop", async () => {
  await openInDesktop();
});

ipcMain.handle("dialog:openDirectory", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

// --- File watching ---

let activeWatcher: FSWatcher | null = null;
let watchedJsonlPath: string | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function resolveJsonlPath(sessionId: string, worktreePath: string): Promise<string | null> {
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
    getClaudeHomeDir(),
    "projects",
    worktreePathToProjectDir(cwd)
  );
  const jsonlPath = join(projectDir, `${cliSessionId}.jsonl`);

  try {
    await stat(jsonlPath);
    return jsonlPath;
  } catch {
    return null;
  }
}

function stopWatching(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (activeWatcher) {
    activeWatcher.close();
    activeWatcher = null;
  }
  watchedJsonlPath = null;
}

function sendToAllWindows(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, ...args);
  });
}

ipcMain.handle(
  "sessions:watch",
  async (_event, sessionId: string, worktreePath: string) => {
    stopWatching();

    const jsonlPath = await resolveJsonlPath(sessionId, worktreePath);
    if (!jsonlPath) return false;

    watchedJsonlPath = jsonlPath;

    activeWatcher = watch(jsonlPath, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        if (!watchedJsonlPath) return;
        try {
          const messages = await readSessionMessages(watchedJsonlPath);
          sendToAllWindows("sessions:updated", messages);
        } catch {
          // file may be mid-write, ignore
        }
      }, 300);
    });

    activeWatcher.on("error", () => {
      stopWatching();
    });

    return true;
  }
);

ipcMain.handle("sessions:unwatch", () => {
  stopWatching();
  return true;
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
