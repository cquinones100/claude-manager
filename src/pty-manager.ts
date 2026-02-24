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

export function getRunningSessionIds(knownIds: string[]): Set<string> {
  if (knownIds.length === 0) return new Set()

  const psOutput = execQuiet("ps -eo args=")
  const claudeLines = psOutput.split("\n").filter((line) => line.includes("claude"))
  const running = new Set<string>()

  knownIds.forEach((id) => {
    if (claudeLines.some((line) => line.includes(id))) {
      running.add(id)
    }
  })

  return running
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

  attach(id: string): Promise<"detached" | "exited"> {
    const entry = this.processes.get(id)
    if (!entry || !entry.alive) return Promise.resolve("exited")

    const { instance } = entry

    return new Promise((resolve) => {
      let resolved = false

      const cleanup = () => {
        entry.attached = false
        process.stdin.off("data", stdinHandler)
        process.stdout.off("resize", resizeHandler)
        dataDisposable.dispose()
        exitDisposable.dispose()
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

      // Flush any output that arrived while detached
      if (entry.outputBuffer) {
        process.stdout.write(entry.outputBuffer)
        entry.outputBuffer = ""
      }
      entry.attached = true

      // Forward live PTY output to stdout
      const dataDisposable = instance.onData((data) => {
        process.stdout.write(data)
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
        instance.write(str)
      }

      const resizeHandler = () => {
        try {
          instance.resize(process.stdout.columns ?? 80, process.stdout.rows ?? 24)
        } catch {
          // PTY may have exited between resize event and handler
        }
      }

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true)
      }
      process.stdin.resume()
      process.stdin.on("data", stdinHandler)
      process.stdout.on("resize", resizeHandler)

      // Trigger repaint via delayed SIGWINCH
      const cols = process.stdout.columns ?? 80
      const rows = process.stdout.rows ?? 24
      setTimeout(() => {
        try {
          instance.resize(Math.max(1, cols - 1), rows)
          setTimeout(() => {
            try { instance.resize(cols, rows) } catch {}
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
