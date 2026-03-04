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
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send("pty:exit", id);
      }
    });

    this.processes.set(id, entry);
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
    const buf = entry.outputBuffer;
    entry.outputBuffer = "";
    return buf;
  }

  kill(id: string): void {
    const entry = this.processes.get(id);
    if (!entry) return;
    entry.alive = false;
    this.processes.delete(id);
    entry.instance.kill();
  }

  killAll(): void {
    this.processes.forEach((entry) => {
      entry.alive = false;
      entry.instance.kill();
    });
    this.processes.clear();
  }

  has(id: string): boolean {
    return this.processes.has(id);
  }

  ids(): Set<string> {
    return new Set(this.processes.keys());
  }
}
