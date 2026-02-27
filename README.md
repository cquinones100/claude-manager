# Claude Tree Vis

Interactive CLI for managing Claude Code worktrees with tmux-style session management. Built with Ink (React for the terminal).

## Stack

- TypeScript, ESM-only
- Ink 5 + React 18 for terminal UI
- node-pty for Claude Code session management
- execa for git operations
- meow for CLI parsing

## Getting Started

```bash
pnpm install
pnpm build
node dist/cli.js
```

Must be run inside a git repo.

## Usage

- **List screen** — Shows all worktrees. Active sessions are marked with a green `●`. Press `q` to exit.
- **Select a worktree** — Opens a full-screen Claude Code session in that worktree's directory.
- **Ctrl+X** — Detaches from the current session and returns to the home screen. The session stays alive in the background.
- **Reattach** — Select the same worktree again to reattach to the running session.
- **`k`** — Kills the session for the currently highlighted worktree (when active).
- **Create screen** — Select "+ Create new worktree" to spawn one. Type a name and press Enter. Press Escape to cancel.

## Project Structure

- `source/cli.tsx` — Entry point with render loop (alternates between Ink UI and PTY attachment)
- `source/app.tsx` — State machine routing between screens
- `source/pty-manager.ts` — PTY session manager (spawn, attach, detach, kill)
- `source/types.ts` — Shared type aliases
- `source/git/worktree.ts` — Git worktree operations
- `source/components/` — Ink UI components
