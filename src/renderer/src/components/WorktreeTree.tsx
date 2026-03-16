import { useState, useEffect, useCallback } from "react";
import { Worktree, WorktreeGraph, CommitInfo } from "../App";

type Props = {
  projectPath: string;
  onWorktreeClick: (worktree: Worktree) => void;
  onCommitClick: (sha: string) => void;
};

const COMMIT_SPACING = 60;
const LANE_HEIGHT = 60;
const MAIN_Y = 40;
const PADDING_LEFT = 120;
const PADDING_RIGHT = 40;
const DOT_RADIUS = 5;
const POLL_INTERVAL = 5000;

const BRANCH_COLORS = [
  "var(--accent)",
  "var(--green)",
  "var(--yellow)",
  "var(--red)",
  "#60a5fa",
  "#c084fc",
];

type TooltipData =
  | { kind: "commit"; commit: CommitInfo; x: number; y: number }
  | { kind: "branch"; label: string; preview: string | null; x: number; y: number };

export default function WorktreeTree({ projectPath, onWorktreeClick, onCommitClick }: Props) {
  const [graph, setGraph] = useState<WorktreeGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const fetchGraph = useCallback(() => {
    return window.electronAPI
      .getWorktreeGraph(projectPath)
      .then(setGraph)
      .catch((err: Error) => setError(err.message));
  }, [projectPath]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchGraph().finally(() => setLoading(false));

    const interval = setInterval(fetchGraph, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchGraph]);

  if (loading) {
    return (
      <div style={{ color: "var(--text-muted)", padding: "24px", textAlign: "center" }}>
        Loading graph...
      </div>
    );
  }

  if (error || !graph) {
    return (
      <div style={{ color: "var(--red)", padding: "24px", textAlign: "center" }}>
        {error ?? "Failed to load graph"}
      </div>
    );
  }

  // Reverse mainCommits so oldest is on the left, newest on the right
  const allMainCommits = [...graph.mainCommits].reverse();

  // Find the earliest fork point across all branches, then start one commit before it
  const forkShas = new Set(graph.branches.map((b) => b.mergeBaseSha));
  let earliestForkIdx = allMainCommits.length - 1;
  allMainCommits.forEach((c, i) => {
    if (forkShas.has(c.sha) && i < earliestForkIdx) earliestForkIdx = i;
  });
  const startIdx = Math.max(0, earliestForkIdx - 1);
  const mainCommits = allMainCommits.slice(startIdx);

  const mainShaToIndex = new Map(mainCommits.map((c, i) => [c.sha, i]));

  const svgWidth =
    PADDING_LEFT + mainCommits.length * COMMIT_SPACING + PADDING_RIGHT;
  const svgHeight = MAIN_Y + (graph.branches.length + 1) * LANE_HEIGHT + 20;

  const commitX = (index: number) => PADDING_LEFT + index * COMMIT_SPACING;

  const showCommitTooltip = (commit: CommitInfo, x: number, y: number) =>
    setTooltip({ kind: "commit", commit, x, y });
  const showBranchTooltip = (label: string, preview: string | null, x: number, y: number) =>
    setTooltip({ kind: "branch", label, preview, x, y });
  const hideTooltip = () => setTooltip(null);

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", position: "relative" }}>
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{ display: "block", minWidth: "100%" }}
      >
        {/* Main branch line */}
        <line
          x1={commitX(0)}
          y1={MAIN_Y}
          x2={commitX(mainCommits.length - 1)}
          y2={MAIN_Y}
          stroke="var(--text-muted)"
          strokeWidth={2}
          style={{ pointerEvents: "none" }}
        />

        {/* Main branch label */}
        <text
          x={PADDING_LEFT - 12}
          y={MAIN_Y + 4}
          textAnchor="end"
          fill="var(--accent)"
          fontSize={12}
          fontWeight={600}
          fontFamily="var(--font-mono)"
        >
          {graph.defaultBranch}
        </text>

        {/* Main branch commit dots */}
        {mainCommits.map((commit, i) => (
          <g key={commit.sha}>
            <circle
              cx={commitX(i)}
              cy={MAIN_Y}
              r={16}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onClick={() => onCommitClick(commit.sha)}
              onMouseEnter={() => showCommitTooltip(commit, commitX(i), MAIN_Y)}
              onMouseLeave={hideTooltip}
            />
            <circle
              cx={commitX(i)}
              cy={MAIN_Y}
              r={DOT_RADIUS}
              fill="var(--accent)"
              stroke="var(--bg)"
              strokeWidth={2}
              style={{ pointerEvents: "none" }}
            />
          </g>
        ))}

        {/* Branch lines */}
        {graph.branches.map((branch, branchIdx) => {
          const color = BRANCH_COLORS[branchIdx % BRANCH_COLORS.length];
          const laneY = MAIN_Y + (branchIdx + 1) * LANE_HEIGHT;

          // Find where this branch forks from main
          let forkIndex = mainShaToIndex.get(branch.mergeBaseSha);
          // If the merge base is older than our visible commits, pin to the leftmost
          if (forkIndex === undefined) forkIndex = 0;

          const forkX = commitX(forkIndex);

          // Branch commits start after the fork point
          const branchCommits = [...branch.commits].reverse();

          const labelX =
            branchCommits.length > 0
              ? forkX + 30 + branchCommits.length * COMMIT_SPACING
              : forkX + 70;

          return (
            <g key={branch.worktree.path}>
              {/* Fork curve from main down to branch lane */}
              <path
                d={`M ${forkX} ${MAIN_Y} Q ${forkX} ${laneY} ${forkX + 30} ${laneY}`}
                fill="none"
                stroke={color}
                strokeWidth={2}
                style={{ pointerEvents: "none" }}
              />

              {/* Branch horizontal line */}
              {branchCommits.length > 0 && (
                <line
                  x1={forkX + 30}
                  y1={laneY}
                  x2={forkX + 30 + (branchCommits.length - 1) * COMMIT_SPACING}
                  y2={laneY}
                  stroke={color}
                  strokeWidth={2}
                  style={{ pointerEvents: "none" }}
                />
              )}

              {/* If no commits, still draw a short line to the label */}
              {branchCommits.length === 0 && (
                <line
                  x1={forkX + 30}
                  y1={laneY}
                  x2={forkX + 60}
                  y2={laneY}
                  stroke={color}
                  strokeWidth={2}
                />
              )}

              {/* Branch commit dots */}
              {branchCommits.map((commit, i) => (
                <g key={commit.sha}>
                  <circle
                    cx={forkX + 30 + i * COMMIT_SPACING}
                    cy={laneY}
                    r={16}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onClick={() => onCommitClick(commit.sha)}
                    onMouseEnter={() =>
                      showCommitTooltip(commit, forkX + 30 + i * COMMIT_SPACING, laneY)
                    }
                    onMouseLeave={hideTooltip}
                  />
                  <circle
                    cx={forkX + 30 + i * COMMIT_SPACING}
                    cy={laneY}
                    r={DOT_RADIUS - 1}
                    fill={color}
                    stroke="var(--bg)"
                    strokeWidth={2}
                    style={{ pointerEvents: "none" }}
                  />
                </g>
              ))}

              {/* Branch label (clickable, hoverable) */}
              <BranchLabel
                x={labelX}
                y={laneY}
                branch={branch.worktree.branch}
                color={color}
                onClick={() => onWorktreeClick(branch.worktree)}
                onMouseEnter={() =>
                  showBranchTooltip(
                    branch.worktree.branch ?? "detached HEAD",
                    branch.worktree.sessionPreview,
                    labelX,
                    laneY
                  )
                }
                onMouseLeave={hideTooltip}
              />
            </g>
          );
        })}
      </svg>

      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: Math.max(8, tooltip.x),
            top: tooltip.y - 32,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            padding: "4px 8px",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            color: "var(--text)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {tooltip.kind === "commit" ? (
            <>
              <span style={{ color: "var(--accent)" }}>{tooltip.commit.shortSha}</span>
              {" — "}
              {tooltip.commit.subject}
            </>
          ) : (
            <>
              {tooltip.preview ?? tooltip.label}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BranchLabel({
  x,
  y,
  branch,
  color,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  x: number;
  y: number;
  branch: string | null;
  color: string;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const label = branch ?? "detached HEAD";
  const height = 22;
  const padding = 8;
  const width = Math.max(label.length * 7.5 + padding * 2, 60);

  return (
    <g
      style={{ cursor: "pointer" }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <rect
        x={x}
        y={y - height / 2}
        width={width}
        height={height}
        rx={4}
        fill={color}
        opacity={0.15}
      />
      <text
        x={x + padding}
        y={y + 4}
        fill={color}
        fontSize={12}
        fontWeight={600}
        fontFamily="var(--font-mono)"
      >
        {label}
      </text>
    </g>
  );
}
