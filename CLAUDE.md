# claude-feed

Terminal UI for browsing today's Claude Code sessions. Built with Ink (React for the terminal).

## Tech stack

- **Runtime**: Node.js with tsx
- **UI**: Ink 5 + React 18
- **Package manager**: pnpm
- **Linting**: ESLint 9 with typescript-eslint and react-hooks
- **Testing**: Vitest
- **TypeScript**: strict, ESM-only (`"type": "module"`)
- **CI**: GitHub Actions — runs lint, typecheck, and tests on push/PR to main

## Key conventions

- Color palette is accessibility-first: blue (AI/accent), yellow (user), white (projects), magenta (tools), red (errors), gray (inactive). Chosen for color-blind safety.
- Colors are applied inline via Ink's `color` prop on `<Text>` and `borderColor` on `<Box>`. No centralized theme file.
- Session data comes from `~/.claude/projects/` JSONL files. Subagent sessions are filtered out.
- File watching uses Node's built-in `fs.watch` with a 300ms debounce.

## Scripts

- `pnpm start` — run the app
- `pnpm dev` — run with hot reload (`node --watch`)
- `pnpm lint` — lint with ESLint
- `pnpm test` — run tests with Vitest
- `pnpm typecheck` — type-check without emitting
