import { Worktree } from "../App";

type Props = {
  worktree: Worktree;
};

export default function WorktreeCard({ worktree }: Props) {
  const parts = worktree.path.split("/");
  const dirName = parts[parts.length - 1];
  const dirParent = parts.slice(0, -1).join("/");

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "14px 16px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "8px 16px",
        alignItems: "start",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <BranchPill branch={worktree.branch} isBare={worktree.isBare} />
          {worktree.isLocked && <LockedBadge />}
        </div>
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
