import { contextBridge, ipcRenderer } from "electron";

type Worktree = {
  path: string;
  head: string;
  branch: string | null;
  isBare: boolean;
  isLocked: boolean;
};

contextBridge.exposeInMainWorld("electronAPI", {
  listWorktrees: (projectPath: string): Promise<Worktree[]> =>
    ipcRenderer.invoke("worktrees:list", projectPath),
  openDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:openDirectory"),
});
