import { useEffect, useRef } from "react";
import { Worktree, SessionInfo, ChatMessage } from "../App";

type Props = {
  worktree: Worktree;
  session: SessionInfo;
  messages: ChatMessage[];
  loading: boolean;
  onBack: () => void;
  onOpenSession: (session: SessionInfo, worktree: Worktree) => void;
};

export default function ChatHistory({ worktree, session, messages, loading, onBack, onOpenSession }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [messages]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0", height: "100%" }}>
      <ChatHeader session={session} onBack={onBack} onOpen={() => onOpenSession(session, worktree)} />

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          padding: "16px 0",
        }}
      >
        {loading && (
          <div style={{ color: "var(--text-muted)", fontSize: "13px", padding: "24px 0", textAlign: "center" }}>
            Loading conversation…
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: "13px", padding: "24px 0", textAlign: "center" }}>
            No messages found for this session.
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function ChatHeader({ session, onBack, onOpen }: { session: SessionInfo; onBack: () => void; onOpen: () => void }) {
  const openLabel = session.source === "cli" ? "Open in Terminal" : "Open in Claude";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        marginBottom: "4px",
      }}
    >
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: "13px",
          padding: "4px 10px",
        }}
      >
        Back
      </button>
      <span
        style={{
          color: "var(--text)",
          fontSize: "13px",
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}
      >
        {session.title ?? session.sessionId.slice(0, 12)}
      </span>
      {session.model && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--text-muted)",
            background: "var(--surface-hover)",
            borderRadius: "4px",
            padding: "2px 6px",
            flexShrink: 0,
          }}
        >
          {session.model}
        </span>
      )}
      <button
        onClick={onOpen}
        title={openLabel}
        style={{
          background: "var(--accent)",
          border: "none",
          borderRadius: "var(--radius)",
          color: "#fff",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: 600,
          padding: "4px 12px",
          flexShrink: 0,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        {openLabel}
      </button>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const time = new Date(message.timestamp);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        maxWidth: "100%",
      }}
    >
      <div
        style={{
          maxWidth: "85%",
          background: isUser ? "var(--accent-dim)" : "var(--surface)",
          border: isUser ? "none" : "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "10px 14px",
        }}
      >
        {message.toolUse && !message.content.trim() && (
          <ToolUseBadge name={message.toolUse.name} />
        )}
        {message.toolUse && message.content.trim() && (
          <div style={{ marginBottom: "6px" }}>
            <ToolUseBadge name={message.toolUse.name} />
          </div>
        )}
        {message.content.trim() && (
          <div
            style={{
              fontSize: "13px",
              lineHeight: 1.6,
              color: "var(--text)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {message.content}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: "10px",
          color: "var(--text-muted)",
          marginTop: "4px",
          padding: "0 4px",
        }}
      >
        {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

function ToolUseBadge({ name }: { name: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: "rgba(250, 204, 21, 0.12)",
        color: "var(--yellow)",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 600,
        fontFamily: "var(--font-mono)",
        padding: "2px 6px",
      }}
    >
      {name}
    </span>
  );
}
