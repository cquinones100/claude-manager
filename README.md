# Worktree Viewer

A desktop app for browsing git worktrees and the Claude Code sessions running inside them.

## Why this exists

Claude Code can work in git worktrees. When you ask Claude Desktop to tackle a task, it often creates a new worktree off your current branch and does its work there in isolation. If you're using the CLI, you might create worktrees yourself and run Claude Code inside them. Either way, you end up with a growing list of worktrees, each potentially containing one or more Claude conversations, and no easy way to see what's happening across all of them.

Worktree Viewer gives you that overview. Point it at a git repo and it shows you every worktree, which ones have Claude sessions, and lets you read the full conversation history for any session.

## The two worlds of Claude Code sessions

Claude Code runs in two environments that store session data differently. Understanding these differences is the core problem this app solves.

### CLI sessions

When you run `claude` from the terminal, session data is written as newline-delimited JSON (JSONL) to:

```
~/.claude/projects/<escaped-path>/<sessionId>.jsonl
```

The `<escaped-path>` is the worktree's absolute path with `/` and `.` replaced by `-`. Each line in the JSONL file is a raw event: user messages, assistant responses, tool calls, tool results, thinking blocks, sidechain messages, and file history snapshots. There is no separate metadata file. To get a "title" for a CLI session, the app reads the first user prompt. There's no model field, no archived flag, no structured summary. The JSONL is the single source of truth, and you have to parse it to learn anything about the session.

### Desktop sessions

Claude Desktop wraps the CLI under the hood, but it also maintains its own metadata layer. For each session, it writes a JSON file to:

```
~/Library/Application Support/Claude/claude-code-sessions/<windowUUID>/<projectUUID>/<sessionId>.json
```

These files contain structured metadata that the CLI doesn't have: a human-readable title, the model used, whether the session is archived, a turn count, and timestamps. Critically, each Desktop session file includes a `cliSessionId` field that links back to the underlying CLI JSONL file. The actual conversation messages still live in the CLI JSONL. Desktop metadata is an index that sits on top of it.

Desktop sessions also register worktrees they create in a central file:

```
~/Library/Application Support/Claude/git-worktrees.json
```

This file maps worktree paths to their names, source branches, and the session that created them. The CLI doesn't write to this file.

### How the app reconciles them

When you load a project path, three things happen in parallel:

1. `git worktree list --porcelain` gives us every worktree under the repo.
2. `git-worktrees.json` is read to identify which worktrees were created by Claude Desktop and attach session metadata.
3. All Desktop session files are scanned to find the most recent session title for each worktree path, used as a preview on the worktree card.

When you click into a worktree to see its sessions, both sources are queried simultaneously. Desktop sessions get priority in the merge: if a Desktop session's `cliSessionId` matches a CLI session's ID, only the Desktop version is kept since it has richer metadata. CLI-only sessions (ones without a Desktop wrapper) are included as-is.

When you open a conversation, the app always reads from the CLI JSONL regardless of whether the session originated from Desktop or CLI. For Desktop sessions, it follows the `cliSessionId` pointer to find the right JSONL file. It then filters the raw events down to user and assistant messages, stripping out tool results, sidechain messages, and thinking blocks.

### Opening sessions

You can open any session directly from the app. Each session card and the chat history header have an "Open" button that behaves differently based on the session source.

For CLI sessions, the app opens a new terminal window at the worktree's path and runs `claude --resume <sessionId>`. It detects iTerm2 if installed, otherwise falls back to Terminal.app. The terminal scripting uses AppleScript via `osascript`. For Desktop sessions, the `cliSessionId` from the Desktop metadata is resolved first so the correct CLI session gets resumed. If the metadata file has been cleaned up, the app skips the `--resume` flag and opens a fresh `claude` at the worktree path rather than accidentally resuming an unrelated session.

For Desktop sessions, clicking "Open App" launches Claude Desktop. There is currently no deep link to navigate to a specific session within the app.

### Live updates

When you're viewing a conversation, the app watches the underlying JSONL file for changes using `fs.watch`. If Claude is actively working in that session, new messages appear in the viewer as they're written to disk. This works the same way for both CLI and Desktop sessions since both ultimately write to the same JSONL files.

## Stack

- Electron 33 with `electron-vite`
- React 18 + TypeScript
- No component library, just inline styles with CSS variables

## Dev

```bash
pnpm install
pnpm dev        # electron-vite dev server + electron
pnpm build      # production build
pnpm test       # Playwright e2e tests
```
