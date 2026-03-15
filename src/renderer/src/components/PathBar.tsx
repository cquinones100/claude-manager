import { useRef, KeyboardEvent } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onBrowse: () => void;
  loading: boolean;
};

export default function PathBar({ value, onChange, onSubmit, onBrowse, loading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onSubmit(value);
  };

  return (
    <div
      style={{
        WebkitAppRegion: "drag",
        padding: "12px 16px",
        paddingTop: "40px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        gap: "8px",
        alignItems: "center",
      } as React.CSSProperties}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Path to git project…"
        style={{
          flex: 1,
          WebkitAppRegion: "no-drag",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          color: "var(--text)",
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          padding: "7px 12px",
          outline: "none",
        } as React.CSSProperties}
      />
      <button
        onClick={onBrowse}
        style={{
          WebkitAppRegion: "no-drag",
          background: "var(--surface-hover)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: "13px",
          padding: "7px 12px",
          whiteSpace: "nowrap",
        } as React.CSSProperties}
      >
        Browse
      </button>
      <button
        onClick={() => onSubmit(value)}
        disabled={loading || !value.trim()}
        style={{
          WebkitAppRegion: "no-drag",
          background: "var(--accent)",
          border: "none",
          borderRadius: "var(--radius)",
          color: "#fff",
          cursor: loading || !value.trim() ? "not-allowed" : "pointer",
          fontSize: "13px",
          fontWeight: 600,
          opacity: loading || !value.trim() ? 0.5 : 1,
          padding: "7px 16px",
          whiteSpace: "nowrap",
        } as React.CSSProperties}
      >
        {loading ? "Loading…" : "Load"}
      </button>
    </div>
  );
}
