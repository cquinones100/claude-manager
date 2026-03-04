import React, { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { api } from "../api";

export function TerminalView({
  worktreePath,
  label,
  sessionId,
  onDetach,
}: {
  worktreePath: string;
  label: string;
  sessionId: string | undefined;
  onDetach: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const spawnedRef = useRef(false);

  const ptyIdRef = useRef(
    sessionId ? `${worktreePath}:${sessionId}` : `${worktreePath}:new-${Date.now()}`,
  );
  const ptyId = ptyIdRef.current;

  const setupTerminal = useCallback(async () => {
    if (!containerRef.current || spawnedRef.current) return;
    spawnedRef.current = true;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: {
        background: "#09090b",
        foreground: "#e4e4e7",
        cursor: "#e4e4e7",
        selectionBackground: "#3f3f46",
        black: "#18181b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e4e4e7",
        brightBlack: "#52525b",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#fafafa",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    terminalRef.current = term;
    fitRef.current = fit;

    const cols = term.cols;
    const rows = term.rows;

    const args: string[] = [];
    if (sessionId) {
      args.push("--resume", sessionId);
    }

    await api.ptySpawn(ptyId, args, cols, rows, worktreePath);

    // Replay any buffered output
    const buf = await api.ptyGetBuffer(ptyId);
    if (buf) {
      term.write(buf);
    }

    // Terminal → PTY
    term.onData((data) => {
      api.ptyWrite(ptyId, data);
    });

    // PTY → Terminal
    const offData = api.onPtyData((id, data) => {
      if (id === ptyId) {
        term.write(data);
      }
    });

    const offExit = api.onPtyExit((id) => {
      if (id === ptyId) {
        term.write("\r\n\x1b[90m[Session ended]\x1b[0m\r\n");
      }
    });

    // Resize
    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      api.ptyResize(ptyId, term.cols, term.rows);
    });
    resizeObserver.observe(containerRef.current);

    // Cleanup on unmount
    return () => {
      offData();
      offExit();
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [ptyId, sessionId]);

  useEffect(() => {
    const cleanup = setupTerminal();
    return () => {
      cleanup?.then((fn) => fn?.());
    };
  }, [setupTerminal]);

  return (
    <div className="h-full flex flex-col bg-[#09090b]">
      <div className="flex items-center justify-between px-4 pt-10 pb-2 border-b border-zinc-800 bg-zinc-900 app-drag">
        <div className="flex items-center gap-2">
          <button
            onClick={onDetach}
            className="text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded transition-colors app-no-drag"
          >
            &larr; Home
          </button>
          <span className="text-xs text-zinc-500 font-mono">{label}</span>
          {sessionId && (
            <span className="text-xs text-zinc-600 font-mono">
              {sessionId.slice(0, 8)}
            </span>
          )}
        </div>
        <button
          onClick={() => api.ptyKill(ptyId)}
          className="text-xs text-zinc-500 hover:text-red-400 transition-colors app-no-drag"
        >
          Kill
        </button>
      </div>
      <div ref={containerRef} className="flex-1 p-1" />
    </div>
  );
}
