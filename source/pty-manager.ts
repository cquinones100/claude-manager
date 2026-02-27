import nodePty from "node-pty";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

function resolveCommand(cmd: string): string {
  return execFileSync("which", [cmd], { encoding: "utf-8" }).trim();
}

const MAX_BUFFER = 64 * 1024;

type PtyEntry = {
  instance: nodePty.IPty;
  alive: boolean;
  attached: boolean;
  outputBuffer: string;
};

export class PtyManager {
  private processes = new Map<string, PtyEntry>();
  private claudePath: string | undefined;

  spawn(id: string): void {
    if (this.processes.has(id)) return;

    if (!this.claudePath) {
      this.claudePath = resolveCommand("claude");
    }

    const cwd = existsSync(id) ? id : process.cwd();

    const instance = nodePty.spawn(this.claudePath, [], {
      name: "xterm-256color",
      cols: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
      cwd,
    });

    const entry: PtyEntry = { instance, alive: true, attached: false, outputBuffer: "" };

    instance.onData((data) => {
      if (!entry.attached) {
        entry.outputBuffer += data;
        if (entry.outputBuffer.length > MAX_BUFFER) {
          entry.outputBuffer = entry.outputBuffer.slice(-MAX_BUFFER);
        }
      }
    });

    instance.onExit(() => {
      entry.alive = false;
      this.processes.delete(id);
    });

    this.processes.set(id, entry);
  }

  attach(id: string, label?: string): Promise<"detached" | "exited"> {
    const entry = this.processes.get(id);
    if (!entry || !entry.alive) return Promise.resolve("exited");

    const { instance } = entry;

    return new Promise((resolve) => {
      let resolved = false;
      let statusBarTimer: ReturnType<typeof setTimeout> | null = null;

      const getCols = () => process.stdout.columns ?? 80;
      const getRows = () => process.stdout.rows ?? 24;

      const renderStatusBar = () => {
        const cols = getCols();
        const rows = getRows();
        const hint = " ctrl+x: home ";
        const sessionLabel = label ? ` ${label} ` : "";
        const content = hint + sessionLabel;
        const padded = content + " ".repeat(Math.max(0, cols - content.length));
        process.stdout.write(
          `\x1b7\x1b[${rows};1H\x1b[7m${padded}\x1b[27m\x1b8`,
        );
      };

      const setupScrollRegion = () => {
        const cols = getCols();
        const rows = getRows();
        const ptyRows = Math.max(1, rows - 1);
        process.stdout.write(`\x1b[1;${ptyRows}r`);
        process.stdout.write("\x1b[1;1H");
        try { instance.resize(cols, ptyRows); } catch {}
        renderStatusBar();
      };

      const resetScrollRegion = () => {
        process.stdout.write("\x1b[r");
      };

      const cleanup = () => {
        if (statusBarTimer) clearTimeout(statusBarTimer);
        entry.attached = false;
        process.stdin.off("data", stdinHandler);
        process.stdout.off("resize", resizeHandler);
        dataDisposable.dispose();
        exitDisposable.dispose();
        resetScrollRegion();
        process.stdout.write("\x1b[?1004l");
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
      };

      const done = (reason: "detached" | "exited") => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(reason);
      };

      process.stdout.write("\x1b[?1004h");
      setupScrollRegion();

      if (entry.outputBuffer) {
        process.stdout.write(entry.outputBuffer);
        entry.outputBuffer = "";
      }
      entry.attached = true;

      // Debounce status bar redraws so we never interleave escape
      // sequences with the child's output stream.  The scroll region
      // already protects the bar row during normal output; this only
      // refreshes it after output settles (e.g. after a full-screen
      // clear from the child).
      const scheduleStatusBar = () => {
        if (statusBarTimer) clearTimeout(statusBarTimer);
        statusBarTimer = setTimeout(renderStatusBar, 150);
      };

      const dataDisposable = instance.onData((data) => {
        process.stdout.write(data);
        scheduleStatusBar();
      });

      const exitDisposable = instance.onExit(() => {
        done("exited");
      });

      const stdinHandler = (data: Buffer) => {
        const str = data.toString();
        // Ctrl+X: legacy (0x18) or CSI u / kitty protocol (\x1b[120;5u)
        if ((data.length === 1 && data[0] === 0x18) || str.includes("\x1b[120;5u")) {
          done("detached");
          return;
        }
        // Strip focus reporting sequences, redraw on focus-in
        const hasFocusIn = str.includes("\x1b[I");
        const cleaned = str.replaceAll("\x1b[I", "").replaceAll("\x1b[O", "");
        if (hasFocusIn) {
          setupScrollRegion();
          const cols = getCols();
          const ptyRows = Math.max(1, getRows() - 1);
          try {
            instance.resize(Math.max(1, cols - 1), ptyRows);
            setTimeout(() => {
              try { instance.resize(cols, ptyRows); } catch {}
            }, 50);
          } catch {}
        }
        if (cleaned.length > 0) {
          instance.write(cleaned);
        }
      };

      const resizeHandler = () => {
        const cols = getCols();
        const rows = getRows();
        const ptyRows = Math.max(1, rows - 1);
        process.stdout.write(`\x1b[1;${ptyRows}r`);
        try { instance.resize(cols, ptyRows); } catch {}
        renderStatusBar();
      };

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
      process.stdin.on("data", stdinHandler);
      process.stdout.on("resize", resizeHandler);

      const cols = getCols();
      const ptyRows = Math.max(1, getRows() - 1);
      setTimeout(() => {
        try {
          instance.resize(Math.max(1, cols - 1), ptyRows);
          setTimeout(() => {
            try { instance.resize(cols, ptyRows); } catch {}
          }, 50);
        } catch {}
      }, 100);
    });
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
