# Claude Tree Vis

Interactive CLI for managing Claude Code worktrees. Built with Ink (React for the terminal).

## Stack

- TypeScript, ESM-only
- Ink 5 + React 18 for terminal UI
- execa for git operations
- meow for CLI parsing

## Project Structure

- `source/` — TypeScript source
  - `cli.tsx` — Entry point (meow + render)
  - `app.tsx` — State machine routing between screens
  - `types.ts` — Shared type aliases
  - `git/worktree.ts` — Git worktree operations (getRepoRoot, listWorktrees, createWorktree)
  - `components/` — Ink UI components (worktree-list, create-worktree, status-message)
- `dist/` — Compiled output (gitignored)

## Commands

- `pnpm build` — Compile TypeScript to `dist/`
- `node dist/cli.js` — Run the CLI (must be inside a git repo)

## Conventions

- Type aliases over interfaces
- Collection methods over for loops
- async/await over .then
- Prefer inlining, extract only when complex
