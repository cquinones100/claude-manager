import React, { useState } from "react";

type CreateResult = {
  success: boolean;
  message: string;
};

export function CreateWorktreeModal({
  parentBranch,
  onSubmit,
  onCancel,
}: {
  parentBranch: string;
  onSubmit: (name: string, parentBranch: string) => Promise<CreateResult>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    const result = await onSubmit(name.trim(), parentBranch);
    if (!result.success) {
      setError(result.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-semibold text-zinc-200 mb-1">
          New worktree
        </h2>
        <p className="text-xs text-zinc-500 mb-4">
          Branching from{" "}
          <span className="text-cyan-400 font-mono">{parentBranch}</span>
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="branch-name"
            autoFocus
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200
                       placeholder-zinc-600 font-mono focus:outline-none focus:border-cyan-500 transition-colors"
          />
          {error && (
            <p className="text-xs text-red-400 mt-2">{error}</p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="text-xs bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:hover:bg-cyan-600
                         text-white px-4 py-1.5 rounded transition-colors"
            >
              {submitting ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
