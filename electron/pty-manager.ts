import nodePty from "node-pty";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { BrowserWindow } from "electron";

const MAX_BUFFER = 64 * 1024;

type PtyEntry = {
  instance: nodePty.IPty;
  alive: boolean;
  outputBuffer: string;
};

export class ElectronPtyManager {
  private processes = new Map<string, PtyEntry>();
  private worktreeToId = new Map<string, string>();
  private claudePath: string | undefined;
  private window: BrowserWindow | null = null;

  setWindow(window: BrowserWindow): void {
    this.window = window;
  }

  spawn(id: string, args: string[] = [], cols = 80, rows = 24, cwd?: string): void {
    if (this.processes.has(id)) return;

    if (!this.claudePath) {
      this.claudePath = execFileSync("which", ["claude"], {
        encoding: "utf-8",
      }).trim();
    }

    const workdir = cwd && existsSync(cwd) ? cwd : existsSync(id) ? id : process.cwd();

    const instance = nodePty.spawn(this.claudePath, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: workdir,
    });

    const entry: PtyEntry = { instance, alive: true, outputBuffer: "" };

    instance.onData((data) => {
      // Always buffer for reattach replay
      entry.outputBuffer += data;
      if (entry.outputBuffer.length > MAX_BUFFER) {
        entry.outputBuffer = entry.outputBuffer.slice(-MAX_BUFFER);
      }
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send("pty:data", id, data);
      }
    });

    instance.onExit(() => {
      entry.alive = false;
      this.processes.delete(id);
      if (cwd) this.worktreeToId.delete(cwd);
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send("pty:exit", id);
      }
    });

    this.processes.set(id, entry);
    if (cwd) this.worktreeToId.set(cwd, id);
  }

  write(id: string, data: string): void {
    const entry = this.processes.get(id);
    if (entry?.alive) {
      entry.instance.write(data);
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const entry = this.processes.get(id);
    if (entry?.alive) {
      try {
        entry.instance.resize(cols, rows);
      } catch {
        // ignore resize errors
      }
    }
  }

  getBuffer(id: string): string {
    const entry = this.processes.get(id);
    if (!entry) return "";
    return entry.outputBuffer;
  }

  findByWorktree(worktreePath: string): string | null {
    const ptyId = this.worktreeToId.get(worktreePath);
    if (ptyId && this.processes.has(ptyId)) return ptyId;
    this.worktreeToId.delete(worktreePath);
    return null;
  }

  kill(id: string): void {
    const entry = this.processes.get(id);
    if (!entry) return;
    entry.alive = false;
    this.processes.delete(id);
    // Clean up worktree mapping
    this.worktreeToId.forEach((ptyId, wt) => {
      if (ptyId === id) this.worktreeToId.delete(wt);
    });
    entry.instance.kill();
  }

  killAll(): void {
    this.processes.forEach((entry) => {
      entry.alive = false;
      entry.instance.kill();
    });
    this.processes.clear();
    this.worktreeToId.clear();
  }

  has(id: string): boolean {
    return this.processes.has(id);
  }

  ids(): Set<string> {
    return new Set(this.processes.keys());
  }

  activeWorktrees(): string[] {
    return [...this.worktreeToId.entries()]
      .filter(([, ptyId]) => this.processes.has(ptyId))
      .map(([path]) => path);
  }
}
