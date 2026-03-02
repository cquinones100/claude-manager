import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "node:path";
import { ElectronPtyManager } from "./pty-manager";
import {
  getRepoRoot,
  listWorktrees,
  createWorktree,
  deleteWorktree,
  buildWorktreeTree,
} from "../source/git/worktree";
import {
  loadWorktreeSessions,
  deriveWorktreeSessions,
} from "../source/sessions";

const ptyManager = new ElectronPtyManager();

// Electron apps on macOS may not inherit shell PATH when launched from Finder.
// Ensure common binary paths are present.
function fixPath(): void {
  if (process.platform !== "darwin") return;
  const path = process.env["PATH"] ?? "";
  const needed = ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"];
  const missing = needed.filter((p) => !path.split(":").includes(p));
  if (missing.length > 0) {
    process.env["PATH"] = [...missing, path].join(":");
  }
}

fixPath();

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  ptyManager.setWindow(win);

  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

// --- IPC handlers ---

ipcMain.handle("worktrees:list", async () => {
  try {
    const repoRoot = await getRepoRoot();
    const worktrees = await listWorktrees();
    const tree = await buildWorktreeTree(worktrees);
    return { tree, repoRoot };
  } catch (err) {
    console.error("worktrees:list error:", err);
    throw err;
  }
});

ipcMain.handle(
  "worktrees:create",
  async (_event, name: string, parentBranch: string) => {
    const repoRoot = await getRepoRoot();
    return createWorktree(name, repoRoot, parentBranch);
  },
);

ipcMain.handle(
  "worktrees:delete",
  async (_event, path: string, branch: string) => {
    return deleteWorktree(path, branch);
  },
);

ipcMain.handle("sessions:load", async (_event, worktreePath: string) => {
  const { entries, mtimes } = await loadWorktreeSessions(worktreePath);
  return deriveWorktreeSessions(entries, mtimes);
});

ipcMain.handle(
  "pty:spawn",
  async (_event, id: string, args: string[], cols: number, rows: number) => {
    ptyManager.spawn(id, args, cols, rows);
  },
);

ipcMain.handle("pty:write", async (_event, id: string, data: string) => {
  ptyManager.write(id, data);
});

ipcMain.handle(
  "pty:resize",
  async (_event, id: string, cols: number, rows: number) => {
    ptyManager.resize(id, cols, rows);
  },
);

ipcMain.handle("pty:kill", async (_event, id: string) => {
  ptyManager.kill(id);
});

ipcMain.handle("pty:getBuffer", async (_event, id: string) => {
  return ptyManager.getBuffer(id);
});

// --- App lifecycle ---

app.whenReady().then(async () => {
  // If not inside a git repo, ask the user to pick one
  try {
    await getRepoRoot();
  } catch {
    const result = await dialog.showOpenDialog({
      title: "Select a git repository",
      properties: ["openDirectory"],
      message: "Claude Tree Vis needs to run inside a git repository.",
    });
    if (result.canceled || result.filePaths.length === 0) {
      app.quit();
      return;
    }
    process.chdir(result.filePaths[0]!);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  ptyManager.killAll();
  app.quit();
});

app.on("before-quit", () => {
  ptyManager.killAll();
});
