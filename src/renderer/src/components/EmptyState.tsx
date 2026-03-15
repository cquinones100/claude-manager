type Props = {
  message: string;
  isError?: boolean;
};

export default function EmptyState({ message, isError }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: isError ? "var(--red)" : "var(--text-muted)",
        fontSize: "14px",
        fontFamily: isError ? "var(--font-mono)" : undefined,
        padding: "32px",
        textAlign: "center",
        lineHeight: 1.6,
      }}
    >
      {message}
    </div>
  );
}
