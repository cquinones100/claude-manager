type Props = {
  mode: "list" | "tree";
  onToggle: (mode: "list" | "tree") => void;
};

export default function ViewToggle({ mode, onToggle }: Props) {
  const buttonStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px",
    fontSize: "12px",
    fontWeight: 600,
    border: "1px solid var(--border)",
    background: active ? "var(--accent)" : "var(--surface)",
    color: active ? "#fff" : "var(--text-muted)",
    cursor: "pointer",
    outline: "none",
    transition: "background 0.15s, color 0.15s",
  });

  return (
    <div style={{ display: "flex", marginBottom: "12px" }}>
      <button
        style={{ ...buttonStyle(mode === "list"), borderRadius: "6px 0 0 6px" }}
        onClick={() => onToggle("list")}
      >
        List
      </button>
      <button
        style={{ ...buttonStyle(mode === "tree"), borderRadius: "0 6px 6px 0", borderLeft: "none" }}
        onClick={() => onToggle("tree")}
      >
        Tree
      </button>
    </div>
  );
}
