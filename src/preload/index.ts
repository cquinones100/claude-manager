import { contextBridge, ipcRenderer } from "electron";

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

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolUse: { name: string } | null;
};

contextBridge.exposeInMainWorld("electronAPI", {
  listWorktrees: (projectPath: string): Promise<Worktree[]> =>
    ipcRenderer.invoke("worktrees:list", projectPath),
  listSessions: (worktreePath: string): Promise<SessionInfo[]> =>
    ipcRenderer.invoke("sessions:list", worktreePath),
  getSessionHistory: (sessionId: string, worktreePath: string): Promise<ChatMessage[]> =>
    ipcRenderer.invoke("sessions:history", sessionId, worktreePath),
  openDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:openDirectory"),
});
