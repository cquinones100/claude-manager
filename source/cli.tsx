#!/usr/bin/env node
import { PassThrough } from "node:stream";
import { render } from "ink";
import meow from "meow";
import { App } from "./app.js";
import { PtyManager } from "./pty-manager.js";
import type { ResumeTarget } from "./types.js";

// Synchronized output (DEC mode 2026): wraps each stdout write with markers
// that tell the terminal to buffer and display atomically, eliminating flicker
// on full-screen redraws. Supported by iTerm2, kitty, Alacritty, WezTerm,
// Windows Terminal, etc. Unsupported terminals ignore the markers harmlessly.
function createSyncStdout() {
  const real = process.stdout;
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === "write") {
        return function (
          chunk: string | Buffer,
          encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
          cb?: (err?: Error | null) => void,
        ) {
          const str = typeof chunk === "string" ? chunk : chunk.toString();
          return target.write(
            `\x1b[?2026h${str}\x1b[?2026l`,
            encodingOrCb as BufferEncoding,
            cb,
          );
        };
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
  });
}

meow(
  `
  Usage
    $ claude-tree-vis

  Interactively manage Claude Code worktrees in the current git repo.
  Select a worktree to open a Claude Code session in it.
  Ctrl+X detaches back to the home screen. Sessions stay alive in the background.
`,
  { importMeta: import.meta },
);

// Create a proxy stdin stream for Ink so it never mutates process.stdin.
// Ink calls stdin.setEncoding('utf8') (irreversible) and stdin.unref(),
// which corrupts process.stdin for subsequent PTY use.
function createInkStdin() {
  const stream = new PassThrough() as PassThrough & {
    isTTY: boolean;
    setRawMode: (mode: boolean) => void;
    ref: () => PassThrough;
    unref: () => PassThrough;
  };
  stream.isTTY = true;
  stream.setRawMode = () => {};
  stream.ref = () => stream;
  stream.unref = () => stream;
  return stream;
}

const ptyManager = new PtyManager();

const cleanup = () => ptyManager.killAll();
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

let running = true;

while (running) {
  // Soft terminal reset — clears modes (app cursor keys, mouse, bracketed paste,
  // etc.) that the PTY child may have enabled, so Ink gets a clean terminal.
  process.stdout.write("\x1b[!p");
  process.stdout.write("\x1b[?25h");
  process.stdout.write("\x1b[2J\x1b[H");

  let resumeTarget: ResumeTarget | undefined;

  const inkStdin = createInkStdin();

  // Forward process.stdin → inkStdin while Ink is active
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.ref();
  process.stdin.resume();
  const forward = (chunk: Buffer) => {
    // Ctrl+C (0x03 in raw mode) — exit immediately
    if (chunk.length === 1 && chunk[0] === 0x03) {
      cleanup();
      process.exit(0);
    }
    inkStdin.write(chunk);
  };
  process.stdin.on("data", forward);

  const inkStdout = createSyncStdout();

  const { waitUntilExit } = render(
    <App
      onResume={(target) => {
        resumeTarget = target;
      }}
      activeSessionIds={ptyManager.ids()}
      onKillSession={(id) => {
        ptyManager.kill(id);
      }}
    />,
    {
      stdin: inkStdin as unknown as typeof process.stdin,
      stdout: inkStdout as unknown as typeof process.stdout,
    },
  );

  await waitUntilExit();

  // Stop forwarding, release stdin for PTY use
  process.stdin.off("data", forward);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();

  if (!resumeTarget) {
    running = false;
    continue;
  }

  if (resumeTarget.sessionId) {
    // Kill existing PTY if any (switching sessions)
    if (ptyManager.has(resumeTarget.worktreePath)) {
      ptyManager.kill(resumeTarget.worktreePath);
    }
    ptyManager.spawn(resumeTarget.worktreePath, ["--resume", resumeTarget.sessionId]);
  } else if (!ptyManager.has(resumeTarget.worktreePath)) {
    ptyManager.spawn(resumeTarget.worktreePath);
  }

  process.stdout.write("\x1b[2J\x1b[H");
  await ptyManager.attach(resumeTarget.worktreePath, resumeTarget.label);
}

cleanup();
