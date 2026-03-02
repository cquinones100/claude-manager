import { contextBridge, ipcRenderer } from "electron";

const api = {
  // Project operations
  listProjects: () => ipcRenderer.invoke("projects:list"),

  // Worktree operations
  listWorktrees: (repoRoot?: string) => ipcRenderer.invoke("worktrees:list", repoRoot),
  createWorktree: (name: string, parentPath: string) =>
    ipcRenderer.invoke("worktrees:create", name, parentPath),
  deleteWorktree: (path: string, branch: string) =>
    ipcRenderer.invoke("worktrees:delete", path, branch),

  // Session operations
  loadSessions: (worktreePath: string) =>
    ipcRenderer.invoke("sessions:load", worktreePath),

  // PTY operations
  ptySpawn: (id: string, args: string[], cols: number, rows: number) =>
    ipcRenderer.invoke("pty:spawn", id, args, cols, rows),
  ptyWrite: (id: string, data: string) =>
    ipcRenderer.invoke("pty:write", id, data),
  ptyResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke("pty:resize", id, cols, rows),
  ptyKill: (id: string) => ipcRenderer.invoke("pty:kill", id),
  ptyGetBuffer: (id: string) => ipcRenderer.invoke("pty:getBuffer", id),

  // PTY events (main → renderer)
  onPtyData: (callback: (id: string, data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string, data: string) =>
      callback(id, data);
    ipcRenderer.on("pty:data", handler);
    return () => ipcRenderer.off("pty:data", handler);
  },
  onPtyExit: (callback: (id: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string) =>
      callback(id);
    ipcRenderer.on("pty:exit", handler);
    return () => ipcRenderer.off("pty:exit", handler);
  },
};

export type Api = typeof api;

contextBridge.exposeInMainWorld("api", api);
