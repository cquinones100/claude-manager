import { Worktree, SessionInfo } from "../App";

type Props = {
  worktree: Worktree;
  sessions: SessionInfo[];
  loading: boolean;
  onBack: () => void;
  onSessionClick: (session: SessionInfo, worktree: Worktree) => void;
};

export default function SessionList({ worktree, sessions, loading, onBack, onSessionClick }: Props) {
  const parts = worktree.path.split("/");
  const dirName = parts[parts.length - 1];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
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
            color: "var(--text-muted)",
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Sessions in{" "}
          <span style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{dirName}</span>
        </span>
      </div>

      {loading && (
        <div style={{ color: "var(--text-muted)", fontSize: "13px", padding: "24px 0", textAlign: "center" }}>
          Loading sessions…
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: "13px", padding: "24px 0", textAlign: "center" }}>
          No sessions found for this worktree.
        </div>
      )}

      {sessions.map((session) => (
        <SessionCard
          key={session.sessionId}
          session={session}
          onClick={() => onSessionClick(session, worktree)}
        />
      ))}
    </div>
  );
}

function SessionCard({ session, onClick }: { session: SessionInfo; onClick: () => void }) {
  const startDate = new Date(session.startedAt);
  const lastDate = new Date(session.lastActiveAt);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        cursor: "pointer",
        transition: "border-color 0.15s",
        outline: "none",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-dim)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <SourceBadge source={session.source} />
        {session.isArchived && <ArchivedBadge />}
        {session.model && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: "var(--text-muted)",
              background: "var(--surface-hover)",
              borderRadius: "4px",
              padding: "2px 6px",
            }}
          >
            {session.model}
          </span>
        )}
        <span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "auto" }}>
          {session.completedTurns} turn{session.completedTurns !== 1 ? "s" : ""}
        </span>
      </div>

      {session.title && (
        <div
          style={{
            fontSize: "13px",
            color: "var(--text)",
            lineHeight: 1.5,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {session.title}
        </div>
      )}

      <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--text-muted)" }}>
        <span title={startDate.toLocaleString()}>
          Started {formatTimeAgo(startDate)}
        </span>
        <span title={lastDate.toLocaleString()}>
          Last active {formatTimeAgo(lastDate)}
        </span>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: "desktop" | "cli" }) {
  const isDesktop = source === "desktop";
  return (
    <span
      style={{
        background: isDesktop ? "rgba(124, 106, 245, 0.12)" : "rgba(74, 222, 128, 0.12)",
        color: isDesktop ? "var(--accent)" : "var(--green)",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 6px",
      }}
    >
      {isDesktop ? "desktop" : "cli"}
    </span>
  );
}

function ArchivedBadge() {
  return (
    <span
      style={{
        background: "rgba(136, 136, 150, 0.12)",
        color: "var(--text-muted)",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 6px",
      }}
    >
      archived
    </span>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
