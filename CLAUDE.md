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
      App.tsx                    — top-level state machine, view routing (list → sessions → chat)
      index.css                  — CSS variables, global reset
      main.tsx                   — React root
      components/
        PathBar.tsx              — path input, Browse (native dialog), Load button
        WorktreeCard.tsx         — single worktree row: branch pill, SHA, locked badge, clickable
        WorktreeList.tsx         — maps worktrees to WorktreeCard
        WorktreeTree.tsx         — SVG tree visualization: main as horizontal line, branches forking off
        ViewToggle.tsx           — list/tree view mode toggle
        SessionList.tsx          — session list for a selected worktree, clickable
        ChatHistory.tsx          — chat conversation view (user right, assistant left)
        EmptyState.tsx           — idle / loading / error placeholder
```

## IPC Channels

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `worktrees:list` | renderer → main | `projectPath: string` | `Worktree[]` |
| `sessions:list` | renderer → main | `worktreePath: string` | `SessionInfo[]` |
| `sessions:history` | renderer → main | `sessionId: string, worktreePath: string` | `ChatMessage[]` |
| `dialog:openDirectory` | renderer → main | — | `string \| null` |
| `session:openInTerminal` | renderer → main | `sessionId: string, worktreePath: string` | `void` |
| `session:openInDesktop` | renderer → main | — | `void` |
| `sessions:watch` | renderer → main | `sessionId: string, worktreePath: string` | `boolean` |
| `sessions:unwatch` | renderer → main | — | `boolean` |
| `worktrees:graph` | renderer → main | `projectPath: string` | `WorktreeGraph` |
| `sessions:updated` | main → renderer | — | `ChatMessage[]` |

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
  title: string | null;
  model: string | null;
  startedAt: string;      // ISO timestamp
  lastActiveAt: string;   // ISO timestamp
  isArchived: boolean;
  completedTurns: number;
  source: "desktop" | "cli";
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;        // extracted text blocks only
  timestamp: string;      // ISO timestamp
  toolUse: { name: string } | null;
};
```

## Tree View

The tree view shows main as a horizontal line with commit dots (oldest left,
newest right). Worktree branches fork off at their merge-base commit and run
as parallel horizontal lines below. Rendered with inline SVG — no external
chart library. Branch labels are clickable and navigate to the sessions view.
The `worktrees:graph` IPC channel runs `git log` on the default branch and
`git merge-base` per worktree branch to build the graph data.

## Claude Session Association

Worktrees created by Claude Desktop are registered in
`~/Library/Application Support/Claude/git-worktrees.json`. The main process
reads this file alongside `git worktree list --porcelain` and matches entries
by path. CLI-created worktrees are not yet covered.

## Session Discovery

Two sources are scanned for sessions:

- **Desktop**: `~/Library/Application Support/Claude/claude-code-sessions/<windowUUID>/<projectUUID>/<sessionId>.json`
  — rich metadata (title, model, archived status). Each file has a `cliSessionId`
  linking to the CLI JSONL for conversation history.
- **CLI**: `~/.claude/projects/<escaped-path>/*.jsonl` where `<escaped-path>` is
  the worktree's absolute path with `/` replaced by `-`.

Desktop sessions are matched by `cwd` or `worktreePath`. For chat history,
Desktop sessions resolve via `cliSessionId` to the CLI JSONL file. Messages
are filtered to exclude sidechain messages, tool results, and thinking blocks.

## Opening Sessions

Sessions can be opened directly from the app. CLI sessions open a new
terminal window (iTerm2 if installed, otherwise Terminal.app) at the worktree
path and run `claude --resume <sessionId>`. Desktop sessions open the Claude
app. For desktop sessions, the `cliSessionId` from the desktop metadata is
resolved so the correct CLI session is resumed. If the metadata is missing,
`claude` starts fresh at the worktree path instead of resuming a stale session.

## Live Watching

When viewing a chat conversation, the app watches the underlying JSONL file
for changes and automatically refreshes the message list. This is managed via
`sessions:watch`/`sessions:unwatch` IPC channels with a 300ms debounce.

## Dev

```bash
pnpm dev      # starts electron-vite dev server + electron
pnpm build    # production build to out/
pnpm test     # build + run Playwright e2e tests
```

## Testing

Playwright e2e tests live in `e2e/`. The fixture in `e2e/fixtures/setup.ts`
creates a temporary git repo with a worktree and mock Claude session data
(Desktop metadata + CLI JSONL). The app reads from these fixtures via
`CLAUDE_APP_DATA_DIR` and `CLAUDE_HOME_DIR` environment variables so tests
don't depend on local file system state.

## Notes

- `pnpm.onlyBuiltDependencies` in `package.json` is set to `["electron", "esbuild"]` — required for pnpm v10 to run their install scripts
- After a fresh `pnpm install`, run `node node_modules/electron/install.js` if the electron binary is missing
- macOS title bar uses `hiddenInset` + `WebkitAppRegion: drag` on PathBar
