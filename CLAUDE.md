# Claude Tree Vis

Interactive CLI for managing Claude Code worktrees with tmux-style session management. Built with Ink (React for the terminal).

## Stack

- TypeScript, ESM-only
- Ink 5 + React 18 for terminal UI
- node-pty for PTY-based Claude Code sessions
- execa for git operations
- meow for CLI parsing

## Project Structure

- `source/` — TypeScript source
  - `cli.tsx` — Entry point with render loop (alternates between Ink UI and PTY attachment)
  - `app.tsx` — State machine routing between screens
  - `pty-manager.ts` — PTY session manager (spawn, attach/detach, kill)
  - `types.ts` — Shared type aliases (Worktree, AppScreen, CreateResult, ResumeTarget)
  - `git/worktree.ts` — Git worktree operations (getRepoRoot, listWorktrees, createWorktree)
  - `components/` — Ink UI components (worktree-list, create-worktree, status-message)
- `dist/` — Compiled output (gitignored)

## Architecture

The CLI uses a render loop pattern: a `while` loop in `cli.tsx` alternates between rendering the Ink UI and attaching to a raw PTY session. When a user selects a worktree, the Ink app exits and hands control to the PTY manager, which spawns/reattaches a `claude` process. Ctrl+X detaches back to the Ink UI.

## Commands

- `pnpm build` — Compile TypeScript to `dist/`
- `node dist/cli.js` — Run the CLI (must be inside a git repo)

## Conventions

- Type aliases over interfaces
- Collection methods over for loops
- async/await over .then
- Prefer inlining, extract only when complex
