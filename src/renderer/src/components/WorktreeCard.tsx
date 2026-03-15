import { Worktree, ClaudeSession } from "../App";

type Props = {
  worktree: Worktree;
  onClick: () => void;
};

export default function WorktreeCard({ worktree, onClick }: Props) {
  const parts = worktree.path.split("/");
  const dirName = parts[parts.length - 1];
  const dirParent = parts.slice(0, -1).join("/");

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "14px 16px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "8px 16px",
        alignItems: "start",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-dim)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <BranchPill branch={worktree.branch} isBare={worktree.isBare} />
          {worktree.isLocked && <LockedBadge />}
        </div>
        {worktree.sessionPreview && (
          <div
            style={{
              fontSize: "13px",
              color: "var(--text)",
              lineHeight: 1.4,
              marginBottom: "4px",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical",
            }}
          >
            {worktree.sessionPreview}
          </div>
        )}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "13px",
            color: "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={worktree.path}
        >
          <span style={{ color: "var(--text-muted)" }}>{dirParent}/</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{dirName}</span>
        </div>
        {worktree.claudeSession && <ClaudeSessionInfo session={worktree.claudeSession} />}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          color: "var(--text-muted)",
          marginTop: "2px",
          textAlign: "right",
        }}
        title={`HEAD: ${worktree.head}`}
      >
        {worktree.head.slice(0, 7)}
      </div>
    </div>
  );
}

function ClaudeSessionInfo({ session }: { session: ClaudeSession }) {
  const createdDate = new Date(session.createdAt);
  const timeAgo = formatTimeAgo(createdDate);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginTop: "8px",
        fontSize: "12px",
        color: "var(--text-muted)",
      }}
    >
      <span
        style={{
          background: "rgba(74, 222, 128, 0.12)",
          color: "var(--green)",
          borderRadius: "4px",
          fontSize: "11px",
          fontWeight: 600,
          padding: "2px 6px",
          fontFamily: "var(--font-mono)",
        }}
      >
        claude
      </span>
      <span style={{ fontFamily: "var(--font-mono)" }}>{session.name}</span>
      <span title={`from ${session.sourceBranch}`}>
        off {session.sourceBranch}
      </span>
      <span title={createdDate.toLocaleString()}>{timeAgo}</span>
    </div>
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

function BranchPill({ branch, isBare }: { branch: string | null; isBare: boolean }) {
  if (isBare) {
    return (
      <span
        style={{
          background: "rgba(250,204,21,0.15)",
          color: "var(--yellow)",
          borderRadius: "4px",
          fontSize: "12px",
          fontWeight: 600,
          padding: "2px 8px",
          fontFamily: "var(--font-mono)",
        }}
      >
        bare
      </span>
    );
  }

  return (
    <span
      style={{
        background: "rgba(124,106,245,0.15)",
        color: "var(--accent)",
        borderRadius: "4px",
        fontSize: "12px",
        fontWeight: 600,
        padding: "2px 8px",
        fontFamily: "var(--font-mono)",
        maxWidth: "400px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        display: "inline-block",
      }}
      title={branch ?? "detached HEAD"}
    >
      {branch ?? "detached HEAD"}
    </span>
  );
}

function LockedBadge() {
  return (
    <span
      style={{
        background: "rgba(248,113,113,0.15)",
        color: "var(--red)",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 6px",
      }}
    >
      locked
    </span>
  );
}
