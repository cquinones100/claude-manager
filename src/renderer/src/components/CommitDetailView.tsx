import { CommitDetail } from "../App";

type Props = {
  commit: CommitDetail;
  loading: boolean;
  onBack: () => void;
};

export default function CommitDetailView({ commit, loading, onBack }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          paddingBottom: "12px",
          borderBottom: "1px solid var(--border)",
          marginBottom: "16px",
        }}
      >
        <button
          onClick={onBack}
          role="button"
          tabIndex={0}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            color: "var(--text)",
            padding: "6px 12px",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          Back
        </button>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "13px",
            color: "var(--accent)",
          }}
        >
          {commit.shortSha}
        </span>
      </div>

      {loading ? (
        <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "24px" }}>
          Loading commit...
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "var(--text)",
              marginBottom: "12px",
              lineHeight: 1.4,
            }}
          >
            {commit.subject}
          </h2>

          <div
            style={{
              display: "flex",
              gap: "16px",
              fontSize: "12px",
              color: "var(--text-muted)",
              marginBottom: "20px",
            }}
          >
            <span>{commit.authorName}</span>
            <span>{new Date(commit.authorDate).toLocaleString()}</span>
          </div>

          {commit.body && (
            <pre
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "13px",
                color: "var(--text)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "16px",
              }}
            >
              {commit.body}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
