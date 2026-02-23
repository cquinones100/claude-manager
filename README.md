# claude-feed

A terminal UI for browsing today's Claude Code sessions. Built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal).

## What it does

Reads the JSONL session logs from `~/.claude/projects/` and presents them in two views:

- **Session grid** — a 3x3 card layout showing today's sessions with project name, activity time, and a preview of the last conversation exchange.
- **Thread view** — a scrollable list of all messages in a session: user prompts, Claude responses, and tool calls with their results.

You can resume any session directly from the UI, which spawns `claude --resume <session-id>` in the session's original working directory.

## Setup

```
pnpm install
```

## Usage

```
pnpm start
```

For development with hot reload:

```
pnpm dev
```

## Keybindings

### Session grid

| Key | Action |
|-----|--------|
| Arrow keys | Navigate cards |
| Enter | Open session thread |
| r | Resume session in Claude |
| q | Quit |

### Thread view

| Key | Action |
|-----|--------|
| Up/Down | Navigate messages |
| Enter | Expand/collapse message |
| r | Resume session in Claude |
| b / Esc | Back to grid |
| q | Quit |

## Project structure

```
src/
  cli.tsx          Entry point — renders the app and handles resume loop
  types.ts         Shared type definitions
  sessions.ts      Session file parsing, grouping, and thread extraction
  components/
    App.tsx         Root component with view routing and file watching
    SessionGrid.tsx Grid of session cards
    ThreadView.tsx  Scrollable conversation thread
    FeedItem.tsx    Individual feed entry (used in legacy feed view)
    FilterBar.tsx   Type/project filter controls
    Scrollbar.tsx   Vertical scrollbar indicator
```
