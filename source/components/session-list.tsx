import { useState, useMemo, useRef, useEffect, useCallback, memo } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { watch } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SessionSummary } from "../types.js";
import {
  loadWorktreeSessions,
  deriveWorktreeSessions,
  projectDirForWorktree,
  formatRelativeTime,
  formatModelName,
} from "../sessions.js";
import { Scrollbar } from "./scrollbar.js";

type SessionFilter = "active" | "all";

function AnimatedEllipsis() {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(id);
  }, []);
  return <>{".".repeat(dots) + " ".repeat(3 - dots)}</>;
}

function Shortcut({ keyName, description }: { keyName: string; description: string }) {
  return (
    <Text>
      <Text color="cyan">{keyName}</Text>
      <Text dimColor> {description}</Text>
    </Text>
  );
}

const COLS = 3;
const ROWS = 3;
const CHROME_LINES = 4;

const PULSE_DURATION = 1500;

type SessionCardProps = {
  session: SessionSummary;
  isSelected: boolean;
  isPulsing: boolean;
  isActive: boolean;
  width: number;
  height: number;
  previewOffset: number;
};

// Card chrome: 2 border lines + 2 header lines (title + metadata)
const CARD_CHROME_LINES = 4;
// Each preview entry takes 1 line of text + 1 line of spacing (except the last)
const LINES_PER_ENTRY = 2;

function visibleEntryCount(cardHeight: number): number {
  const contentLines = Math.max(0, cardHeight - CARD_CHROME_LINES);
  // N entries take N + (N-1) lines = 2N - 1, so N = floor((lines + 1) / 2)
  return Math.max(1, Math.floor((contentLines + 1) / LINES_PER_ENTRY));
}

const SessionCard = memo(function SessionCard({ session, isSelected, isPulsing, isActive, width, height, previewOffset }: SessionCardProps) {
  const [waitingPulse, setWaitingPulse] = useState(false);
  const isWaiting = session.status === "waiting";

  useEffect(() => {
    if (!isWaiting) return;
    const id = setInterval(() => setWaitingPulse((v) => !v), 1000);
    return () => {
      clearInterval(id);
      setWaitingPulse(false);
    };
  }, [isWaiting]);

  const borderColor = isSelected ? "cyan" : isPulsing ? "green" : waitingPulse ? "yellow" : "gray";

  const visible = visibleEntryCount(height);
  const total = session.preview.length;
  // Default (offset -1): pin to the end of the conversation
  const startIdx = previewOffset < 0
    ? Math.max(0, total - visible)
    : Math.min(previewOffset, Math.max(0, total - visible));
  const visibleEntries = session.preview.slice(startIdx, startIdx + visible);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      width={width}
      height={height}
    >
      <Box flexShrink={0} justifyContent="space-between">
        <Text bold={isSelected} color={isSelected ? "cyan" : undefined} wrap="truncate">
          {isActive && <Text color="green">▶ </Text>}
          {session.sessionId.slice(0, 8)}
        </Text>
        {session.status === "thinking" && <Text color="blue" bold>thinking<AnimatedEllipsis /></Text>}
        {session.status === "waiting" && <Text color="yellow" bold>waiting<AnimatedEllipsis /></Text>}
      </Box>
      <Box flexShrink={0}>
        <Text color="cyan" wrap="truncate">
          {[
            formatRelativeTime(session.lastActivityAt),
            session.model && formatModelName(session.model),
            session.gitBranch && `\u2387 ${session.gitBranch}`,
          ].filter(Boolean).join(" · ")}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleEntries.map((line, i) => (
          <Box key={startIdx + i} marginBottom={i < visibleEntries.length - 1 ? 1 : 0}>
            <Text color={line.label === "User" ? "yellow" : "blue"} dimColor={!isSelected} wrap="truncate">
              {line.label}: {line.text}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
});

function useTerminalSize() {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    width: stdout?.columns ?? 80,
    height: stdout?.rows ?? 24,
  });

  useEffect(() => {
    const onResize = () => {
      setSize({
        width: stdout?.columns ?? 80,
        height: stdout?.rows ?? 24,
      });
    };
    stdout?.on("resize", onResize);
    return () => { stdout?.off("resize", onResize); };
  }, [stdout]);

  return size;
}

type SessionListProps = {
  worktreePath: string;
  worktreeLabel: string;
  onResume: (sessionId: string | undefined) => void;
  onBack: () => void;
  activeSessionIds: Set<string>;
  onKillSession: (id: string) => void;
};

export function SessionList({
  worktreePath,
  worktreeLabel,
  onResume,
  onBack,
  activeSessionIds,
  onKillSession,
}: SessionListProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const cellWidth = Math.floor(termWidth / COLS);
  const cellHeight = Math.floor((termHeight - CHROME_LINES) / ROWS);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [filter, setFilter] = useState<SessionFilter>("active");
  const [pulsingIds, setPulsingIds] = useState<Set<string>>(new Set());
  const [previewOffset, setPreviewOffset] = useState(-1);
  const prevCountsRef = useRef<Map<string, number>>(new Map());
  const loadingRef = useRef(false);

  const loadSessions = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { entries, mtimes } = await loadWorktreeSessions(worktreePath);
      setSessions(deriveWorktreeSessions(entries, mtimes));
      setLoading(false);
    } finally {
      loadingRef.current = false;
    }
  }, [worktreePath]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Stable ref so the watcher always calls the latest loadSessions
  const loadRef = useRef(loadSessions);
  useEffect(() => { loadRef.current = loadSessions; }, [loadSessions]);

  // Watch project directory for live updates
  useEffect(() => {
    const dirName = projectDirForWorktree(worktreePath);
    const dirPath = join(homedir(), ".claude", "projects", dirName);
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    let watcher: ReturnType<typeof watch> | undefined;
    try {
      watcher = watch(dirPath, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadRef.current(), 1000);
      });
    } catch {
      // Directory may not exist yet
    }

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      watcher?.close();
    };
  }, [worktreePath]);

  const filtered = useMemo(
    () =>
      filter === "active"
        ? sessions.filter(
            (s) => s.status !== "idle" || Date.now() - s.lastActivityAt.getTime() < 5 * 60_000,
          )
        : sessions,
    [sessions, filter],
  );

  // Pulse animation for updated sessions
  useEffect(() => {
    const prev = prevCountsRef.current;
    const updated = new Set<string>();

    sessions.forEach((s) => {
      const old = prev.get(s.sessionId);
      if (old !== undefined && old !== s.entryCount) {
        updated.add(s.sessionId);
      }
      prev.set(s.sessionId, s.entryCount);
    });

    if (updated.size > 0) {
      setPulsingIds((current) => new Set([...current, ...updated]));
      setTimeout(() => {
        setPulsingIds((current) => {
          const next = new Set(current);
          updated.forEach((id) => next.delete(id));
          return next;
        });
      }, PULSE_DURATION);
    }
  }, [sessions]);

  const totalRows = Math.ceil(filtered.length / COLS);
  const cursorRow = Math.floor(cursor / COLS);
  const scrollRow = Math.max(0, Math.min(cursorRow - Math.floor(ROWS / 2), totalRows - ROWS));

  const moveCursor = (next: number) => {
    setCursor(next);
    setPreviewOffset(-1);
  };

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (input === "n") {
      onResume(undefined);
      return;
    }
    if (input === "f") {
      setFilter((f) => (f === "active" ? "all" : "active"));
      moveCursor(0);
      return;
    }

    if (filtered.length === 0) return;

    if (key.leftArrow) {
      moveCursor(Math.max(0, cursor - 1));
    }
    if (key.rightArrow) {
      moveCursor(Math.min(filtered.length - 1, cursor + 1));
    }
    if (key.upArrow) {
      moveCursor(Math.max(0, cursor - COLS));
    }
    if (key.downArrow) {
      moveCursor(Math.min(filtered.length - 1, cursor + COLS));
    }

    // Shift+K: scroll preview up (older entries)
    if (input === "K") {
      setPreviewOffset((prev) => {
        const session = filtered[cursor];
        if (!session) return prev;
        const total = session.preview.length;
        const visible = visibleEntryCount(cellHeight);
        const maxOffset = Math.max(0, total - visible);
        // If pinned to end, start from the end position
        const current = prev < 0 ? maxOffset : prev;
        return Math.max(0, current - 1);
      });
    }
    // Shift+J: scroll preview down (newer entries)
    if (input === "J") {
      setPreviewOffset((prev) => {
        const session = filtered[cursor];
        if (!session) return prev;
        const total = session.preview.length;
        const visible = visibleEntryCount(cellHeight);
        const maxOffset = Math.max(0, total - visible);
        if (prev < 0) return prev;
        const next = prev + 1;
        return next >= maxOffset ? -1 : next;
      });
    }

    if (key.return) {
      const session = filtered[cursor];
      if (session) onResume(session.sessionId);
    }
    if (input === "x") {
      const session = filtered[cursor];
      if (session && activeSessionIds.has(session.sessionId)) {
        onKillSession(session.sessionId);
      }
    }
  });

  if (loading) {
    return (
      <Box padding={1}>
        <Text dimColor>Loading sessions…</Text>
      </Box>
    );
  }

  const filterLabel = filter === "active" ? "Active" : "All";
  const title = `${worktreeLabel} — ${filterLabel} Sessions (${filtered.length})`;

  if (filtered.length === 0) {
    return (
      <Box flexDirection="column" padding={1} height={termHeight}>
        <Text bold>{title}</Text>
        <Box marginTop={1} flexGrow={1}>
          <Text dimColor>
            {filter === "active"
              ? "No active sessions. Press f to show all."
              : "No sessions yet. Press n to start a new session."}
          </Text>
        </Box>
        <Box gap={2}>
          <Shortcut keyName="n" description="new session" />
          <Shortcut keyName="f" description={filter === "active" ? "show all" : "active only"} />
          <Shortcut keyName="esc" description="back" />
        </Box>
      </Box>
    );
  }

  const visibleStart = scrollRow * COLS;
  const visibleEnd = Math.min(filtered.length, (scrollRow + ROWS) * COLS);
  const visibleSessions = filtered.slice(visibleStart, visibleEnd);

  const rows: SessionSummary[][] = [];
  for (let i = 0; i < visibleSessions.length; i += COLS) {
    rows.push(visibleSessions.slice(i, i + COLS));
  }

  return (
    <Box flexDirection="column" padding={1} height={termHeight}>
      <Text bold>{title}</Text>
      <Box marginTop={1} flexGrow={1}>
        <Box flexDirection="column" flexGrow={1}>
          {rows.map((row, rowIdx) => (
            <Box key={scrollRow + rowIdx}>
              {row.map((session, colIdx) => {
                const globalIdx = visibleStart + rowIdx * COLS + colIdx;
                return (
                  <SessionCard
                    key={session.sessionId}
                    session={session}
                    isSelected={globalIdx === cursor}
                    isPulsing={pulsingIds.has(session.sessionId)}
                    isActive={activeSessionIds.has(session.sessionId)}
                    width={cellWidth}
                    height={cellHeight}
                    previewOffset={globalIdx === cursor ? previewOffset : -1}
                  />
                );
              })}
            </Box>
          ))}
        </Box>
        <Scrollbar
          totalItems={totalRows}
          visibleCount={ROWS}
          scrollOffset={scrollRow}
          height={ROWS * cellHeight}
        />
      </Box>
      <Box gap={2}>
        <Shortcut keyName="←↑↓→" description="navigate" />
        <Shortcut keyName="J/K" description="scroll preview" />
        <Shortcut keyName="enter" description="resume" />
        <Shortcut keyName="n" description="new session" />
        <Shortcut keyName="f" description={filter === "active" ? "show all" : "active only"} />
        <Shortcut keyName="esc" description="back" />
      </Box>
    </Box>
  );
}
