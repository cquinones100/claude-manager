import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";

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
