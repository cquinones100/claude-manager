# worktree-viewer

Electron + Vite + React + TypeScript app that lists git worktrees for a given project path.

## Stack

- **Electron 33** with `electron-vite` for the build toolchain
- **React 18** + TypeScript for the renderer
- **No external UI library** — plain inline styles with CSS variables

## Project Structure

```
src/
  main/index.ts       — main process: runs `git worktree list --porcelain`, IPC handlers
  preload/index.ts    — contextBridge: exposes listWorktrees + openDirectory to renderer
  renderer/
    index.html
    src/
      App.tsx                    — top-level state machine, view routing (list ↔ sessions)
      index.css                  — CSS variables, global reset
      main.tsx                   — React root
      components/
        PathBar.tsx              — path input, Browse (native dialog), Load button
        WorktreeCard.tsx         — single worktree row: branch pill, SHA, locked badge, clickable
        WorktreeList.tsx         — maps worktrees to WorktreeCard
        SessionList.tsx          — session detail view for a selected worktree
        EmptyState.tsx           — idle / loading / error placeholder
```

## IPC Channels

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `worktrees:list` | renderer → main | `projectPath: string` | `Worktree[]` |
| `sessions:list` | renderer → main | `worktreePath: string` | `SessionInfo[]` |
| `dialog:openDirectory` | renderer → main | — | `string \| null` |

## Types

```ts
type ClaudeSession = {
  name: string;           // e.g. "cranky-curran"
  sessionId: string;      // e.g. "local_0aad9201-..."
  sourceBranch: string;   // branch the worktree was forked from
  createdAt: number;      // ms since epoch
};

type Worktree = {
  path: string;
  head: string;             // full SHA
  branch: string | null;    // null = detached HEAD
  isBare: boolean;
  isLocked: boolean;
  claudeSession: ClaudeSession | null; // non-null for Claude-created worktrees
};

type SessionInfo = {
  sessionId: string;
  firstPrompt: string;    // first user message (truncated to 200 chars)
  startedAt: string;      // ISO timestamp
  lastActiveAt: string;   // ISO timestamp
  isActive: boolean;      // true if session PID is still running
  messageCount: number;
};
```

## Claude Session Association

Worktrees created by Claude Desktop are registered in
`~/Library/Application Support/Claude/git-worktrees.json`. The main process
reads this file alongside `git worktree list --porcelain` and matches entries
by path. CLI-created worktrees are not yet covered.

## Session Discovery

Sessions are stored in `~/.claude/projects/<escaped-path>/*.jsonl` where
`<escaped-path>` is the worktree's absolute path with `/` replaced by `-`.
Each JSONL file is one session. The main process streams each file to extract
the session ID, first user prompt, timestamps, and message count. Active
sessions are cross-referenced against `~/.claude/sessions/*.json` (keyed by
PID) to determine if the session process is still running.

## Dev

```bash
pnpm dev      # starts electron-vite dev server + electron
pnpm build    # production build to out/
```

## Notes

- `pnpm.onlyBuiltDependencies` in `package.json` is set to `["electron", "esbuild"]` — required for pnpm v10 to run their install scripts
- After a fresh `pnpm install`, run `node node_modules/electron/install.js` if the electron binary is missing
- macOS title bar uses `hiddenInset` + `WebkitAppRegion: drag` on PathBar
