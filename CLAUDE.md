# Claude Tree Vis

Interactive CLI and Electron app for managing Claude Code worktrees with tmux-style session management.

## Stack

- TypeScript, ESM-only
- Ink 5 + React 18 for terminal UI
- Electron + React DOM + Tailwind CSS v4 for desktop UI
- node-pty for PTY-based Claude Code sessions
- xterm.js for terminal rendering in Electron
- execa for git operations
- meow for CLI parsing
- electron-vite for Electron builds

## Project Structure

- `source/` — Shared TypeScript source (used by both CLI and Electron)
  - `cli.tsx` — CLI entry point with render loop
  - `app.tsx` — CLI state machine routing between screens
  - `pty-manager.ts` — CLI PTY session manager (spawn, attach/detach, kill)
  - `types.ts` — Shared type aliases (Worktree, AppScreen, CreateResult, ResumeTarget)
  - `sessions.ts` — Session JSONL parsing and summaries
  - `git/worktree.ts` — Git worktree operations (getRepoRoot, listWorktrees, createWorktree)
  - `components/` — Ink UI components (worktree-list, session-list, create-worktree, etc.)
- `electron/` — Electron app source
  - `main.ts` — Main process (BrowserWindow, IPC handlers)
  - `preload.ts` — contextBridge IPC bridge
  - `pty-manager.ts` — IPC-adapted PTY manager for Electron
  - `renderer/` — React DOM + Tailwind renderer
    - `App.tsx` — Screen router
    - `api.ts` — Typed wrapper for preload bridge
    - `components/` — WorktreeGrid, SessionGrid, TerminalView, etc.
- `dist/` — CLI compiled output (gitignored)
- `out/` — Electron compiled output (gitignored)

## Architecture

### CLI
The CLI uses a render loop pattern: a `while` loop in `cli.tsx` alternates between rendering the Ink UI and attaching to a raw PTY session. When a user selects a worktree, the Ink app exits and hands control to the PTY manager, which spawns/reattaches a `claude` process. Ctrl+X detaches back to the Ink UI.

### Electron
The Electron app uses IPC to bridge between the main process (node-pty, git operations, session parsing) and the renderer (React + Tailwind UI, xterm.js terminal). The main process imports shared modules from `source/` for git and session logic. PTY data flows via `webContents.send` to xterm.js in the renderer.

## Commands

- `pnpm build` — Compile CLI TypeScript to `dist/`
- `node dist/cli.js` — Run the CLI (must be inside a git repo)
- `pnpm electron:dev` — Run Electron app in dev mode
- `pnpm electron:build` — Build Electron app to `out/`

## Conventions

- Type aliases over interfaces
- Collection methods over for loops
- async/await over .then
- Prefer inlining, extract only when complex
