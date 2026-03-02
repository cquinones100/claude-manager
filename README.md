# Claude Tree Vis

Interactive CLI and Electron app for managing Claude Code worktrees with tmux-style session management.

## Stack

- TypeScript, ESM-only
- Ink 5 + React 18 for terminal UI
- Electron + React DOM + Tailwind CSS v4 for desktop UI
- node-pty + xterm.js for Claude Code session management
- execa for git operations

## Getting Started

```bash
pnpm install
```

### CLI

```bash
pnpm build
node dist/cli.js
```

Must be run inside a git repo.

### Electron

```bash
pnpm electron:dev
```

If not run from a git repo, a folder picker dialog opens.

## CLI Usage

- **List screen** — Shows all worktrees as a card grid. Active sessions are marked with a green indicator.
- **Sessions screen** — Select a worktree to see its Claude sessions with conversation previews.
- **Enter** — Resume a session (full-screen Claude Code PTY).
- **Ctrl+X** — Detaches from the current session and returns to the home screen.
- **`n`** — Create a new worktree or session.
- **`x`** — Delete a worktree.
- **`q`** — Quit.

## Electron Usage

- **Worktree grid** — Click a worktree card to view its sessions. Hover for create/delete buttons.
- **Session grid** — Click a session to open it in an embedded terminal (xterm.js). Live session status updates.
- **Home button** — Detach from terminal back to sessions.

## Project Structure

- `source/` — Shared code (types, sessions, git operations) + CLI-specific files
- `electron/` — Electron main process, preload, and React DOM renderer
- `dist/` — CLI build output
- `out/` — Electron build output
