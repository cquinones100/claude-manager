# Claude Tree Vis

Interactive CLI for managing Claude Code worktrees. Built with Ink (React for the terminal).

## Stack

- TypeScript, ESM-only
- Ink 5 + React 18 for terminal UI
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

- **List screen** — Shows all worktrees. Select "+ Create new worktree" to spawn one. Press `q` to exit.
- **Create screen** — Type a name and press Enter. The worktree is created at `.claude/worktrees/<name>` with a matching branch. Press Escape to cancel.
- **Result screen** — Shows success or error. Press any key to return to the list.

## Project Structure

- `source/cli.tsx` — Entry point (meow + render)
- `source/app.tsx` — State machine routing between screens
- `source/types.ts` — Shared type aliases
- `source/git/worktree.ts` — Git worktree operations
- `source/components/` — Ink UI components
