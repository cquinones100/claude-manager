import { Worktree } from "../App";
import WorktreeCard from "./WorktreeCard";

type Props = {
  worktrees: Worktree[];
};

export default function WorktreeList({ worktrees }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div
        style={{
          color: "var(--text-muted)",
          fontSize: "12px",
          marginBottom: "4px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {worktrees.length} worktree{worktrees.length !== 1 ? "s" : ""}
      </div>
      {worktrees.map((wt) => (
        <WorktreeCard key={wt.path} worktree={wt} />
      ))}
    </div>
  );
}
