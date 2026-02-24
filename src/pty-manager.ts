import nodePty from "node-pty"
import { execFileSync, execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

function resolveCommand(cmd: string): string {
  return execFileSync("which", [cmd], { encoding: "utf-8" }).trim()
}

function execQuiet(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] })
  } catch (e: unknown) {
    // Commands like lsof/pgrep exit non-zero even with valid output
    return (e as { stdout?: string }).stdout ?? ""
  }
}

export function killExistingSession(sessionId: string): void {
  const pids = new Set<number>()

  // Find --resume processes by session ID in args
  execQuiet(`pgrep -f "${sessionId}"`)
    .trim().split("\n")
    .forEach((p) => { const n = parseInt(p); if (!isNaN(n)) pids.add(n) })

  // Find fresh claude processes by open task directory
  const taskDir = join(homedir(), ".claude", "tasks", sessionId)
  execQuiet(`lsof +d "${taskDir}"`)
    .split("\n").slice(1)
    .forEach((line) => {
      const pid = parseInt(line.trim().split(/\s+/)[1])
      if (!isNaN(pid)) pids.add(pid)
    })

  pids.delete(process.pid)
  pids.forEach((pid) => {
    try { process.kill(pid, "SIGTERM") } catch {}
  })
}

const MAX_BUFFER = 64 * 1024

type PtyEntry = {
  instance: nodePty.IPty
  alive: boolean
  attached: boolean
  outputBuffer: string
}

export class PtyManager {
  private processes = new Map<string, PtyEntry>()
  private claudePath: string | undefined

  spawn(id: string, cwd: string | undefined, args: string[]): void {
    if (this.processes.has(id)) return

    if (!this.claudePath) {
      this.claudePath = resolveCommand("claude")
    }

    const spawnCwd = cwd && existsSync(cwd) ? cwd : process.cwd()

    const instance = nodePty.spawn(this.claudePath, args, {
      name: "xterm-256color",
      cols: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
      cwd: spawnCwd,
    })

    const entry: PtyEntry = { instance, alive: true, attached: false, outputBuffer: "" }

    // Always capture output — buffer it when detached
    instance.onData((data) => {
      if (!entry.attached) {
        entry.outputBuffer += data
        if (entry.outputBuffer.length > MAX_BUFFER) {
          entry.outputBuffer = entry.outputBuffer.slice(-MAX_BUFFER)
        }
      }
    })

    instance.onExit(() => {
      entry.alive = false
      this.processes.delete(id)
    })

    this.processes.set(id, entry)
  }

  attach(id: string, label?: string): Promise<"detached" | "exited"> {
    const entry = this.processes.get(id)
    if (!entry || !entry.alive) return Promise.resolve("exited")

    const { instance } = entry

    return new Promise((resolve) => {
      let resolved = false

      const getCols = () => process.stdout.columns ?? 80
      const getRows = () => process.stdout.rows ?? 24

      const renderStatusBar = () => {
        const cols = getCols()
        const rows = getRows()
        const hint = " ctrl+x: home "
        const sessionLabel = label ? ` ${label} ` : ""
        const content = hint + sessionLabel
        const padded = content + " ".repeat(Math.max(0, cols - content.length))
        // Save cursor, move to last row, reverse video, draw, restore cursor
        process.stdout.write(
          `\x1b7\x1b[${rows};1H\x1b[7m${padded}\x1b[27m\x1b8`
        )
      }

      const setupScrollRegion = () => {
        const cols = getCols()
        const rows = getRows()
        const ptyRows = Math.max(1, rows - 1)
        // Set scroll region to all rows except the last
        process.stdout.write(`\x1b[1;${ptyRows}r`)
        // Position cursor at top-left within scroll region
        process.stdout.write("\x1b[1;1H")
        // Resize PTY to fit within scroll region
        try { instance.resize(cols, ptyRows) } catch {}
        // Draw the status bar on the reserved bottom row
        renderStatusBar()
      }

      const resetScrollRegion = () => {
        // Reset scroll region to full terminal
        process.stdout.write("\x1b[r")
      }

      const cleanup = () => {
        entry.attached = false
        process.stdin.off("data", stdinHandler)
        process.stdout.off("resize", resizeHandler)
        dataDisposable.dispose()
        exitDisposable.dispose()
        resetScrollRegion()
        // Disable focus reporting
        process.stdout.write("\x1b[?1004l")
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false)
        }
        process.stdin.pause()
      }

      const done = (reason: "detached" | "exited") => {
        if (resolved) return
        resolved = true
        cleanup()
        resolve(reason)
      }

      // Enable focus reporting so we detect iTerm tab switches
      process.stdout.write("\x1b[?1004h")

      // Set up scroll region before flushing buffer
      setupScrollRegion()

      // Flush any output that arrived while detached
      if (entry.outputBuffer) {
        process.stdout.write(entry.outputBuffer)
        entry.outputBuffer = ""
      }
      entry.attached = true

      // Forward live PTY output to stdout, then re-render status bar
      const dataDisposable = instance.onData((data) => {
        process.stdout.write(data)
        renderStatusBar()
      })

      const exitDisposable = instance.onExit(() => {
        done("exited")
      })

      const stdinHandler = (data: Buffer) => {
        const str = data.toString()
        // Ctrl+X: legacy (0x18) or CSI u / kitty protocol (\x1b[120;5u)
        if ((data.length === 1 && data[0] === 0x18) || str === "\x1b[120;5u") {
          done("detached")
          return
        }
        // Strip focus reporting sequences, redraw on focus-in
        const hasFocusIn = str.includes("\x1b[I")
        const cleaned = str.replaceAll("\x1b[I", "").replaceAll("\x1b[O", "")
        if (hasFocusIn) {
          setupScrollRegion()
          const cols = getCols()
          const ptyRows = Math.max(1, getRows() - 1)
          try {
            instance.resize(Math.max(1, cols - 1), ptyRows)
            setTimeout(() => {
              try { instance.resize(cols, ptyRows) } catch { /* resize may fail if exited */ }
            }, 50)
          } catch { /* resize may fail if exited */ }
        }
        if (cleaned.length > 0) {
          instance.write(cleaned)
        }
      }

      const resizeHandler = () => {
        const cols = getCols()
        const rows = getRows()
        const ptyRows = Math.max(1, rows - 1)
        // Update scroll region and PTY size
        process.stdout.write(`\x1b[1;${ptyRows}r`)
        try { instance.resize(cols, ptyRows) } catch {}
        renderStatusBar()
      }

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true)
      }
      process.stdin.resume()
      process.stdin.on("data", stdinHandler)
      process.stdout.on("resize", resizeHandler)

      // Trigger repaint via delayed SIGWINCH
      const cols = getCols()
      const ptyRows = Math.max(1, getRows() - 1)
      setTimeout(() => {
        try {
          instance.resize(Math.max(1, cols - 1), ptyRows)
          setTimeout(() => {
            try { instance.resize(cols, ptyRows) } catch {}
          }, 50)
        } catch {}
      }, 100)
    })
  }

  kill(id: string): void {
    const entry = this.processes.get(id)
    if (!entry) return
    entry.alive = false
    this.processes.delete(id)
    entry.instance.kill()
  }

  killAll(): void {
    this.processes.forEach((entry) => {
      entry.alive = false
      entry.instance.kill()
    })
    this.processes.clear()
  }

  has(id: string): boolean {
    return this.processes.has(id)
  }

  ids(): Set<string> {
    return new Set(this.processes.keys())
  }
}
