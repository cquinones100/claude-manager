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

Can be run from anywhere — the app starts with a project picker.

### Electron

```bash
pnpm electron:dev
```

## CLI Usage

- **Projects screen** — Lists all projects that have Claude session data in `~/.claude/projects/`. Select one to enter.
- **Worktrees screen** — Shows all worktrees as a card grid. Active sessions are marked with a green indicator.
- **Sessions screen** — Select a worktree to see its Claude sessions with conversation previews.
- **Enter** — Resume a session (full-screen Claude Code PTY).
- **Ctrl+X** — Detaches from the current session and returns to the home screen.
- **Esc** — Go back to the previous screen.
- **`n`** — Create a new worktree or session.
- **`x`** — Delete a worktree.
- **`q`** — Quit.

## Electron Usage

- **Projects grid** — Click a project card to view its worktrees.
- **Worktree grid** — Click a worktree card to view its sessions. Hover for create/delete buttons.
- **Session grid** — Click a session to open it in an embedded terminal (xterm.js). Live session status updates.
- **Back button** — Navigate up through the screen hierarchy.

## Project Structure

- `source/` — Shared code (types, sessions, git operations) + CLI-specific files
- `electron/` — Electron main process, preload, and React DOM renderer
- `dist/` — CLI build output
- `out/` — Electron build output
