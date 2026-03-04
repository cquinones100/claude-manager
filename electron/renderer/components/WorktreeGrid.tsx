import React from "react";

type Worktree = {
  path: string;
  head: string;
  branch: string;
  isBare: boolean;
};

type TreeNode = {
  worktree: Worktree;
  children: TreeNode[];
};

type FlatItem = {
  worktree: Worktree;
  depth: number;
  isRoot: boolean;
};

function flatten(node: TreeNode, depth = 0): FlatItem[] {
  const items: FlatItem[] = [
    { worktree: node.worktree, depth, isRoot: depth === 0 },
  ];
  node.children.forEach((child) => {
    items.push(...flatten(child, depth + 1));
  });
  return items;
}

function shortenPath(fullPath: string, repoRoot: string): string {
  if (fullPath.startsWith(repoRoot)) {
    const rel = fullPath.slice(repoRoot.length);
    return rel.startsWith("/") ? "." + rel : rel || ".";
  }
  return fullPath.replace(/^\/Users\/[^/]+/, "~");
}

export function WorktreeGrid({
  tree,
  repoRoot,
  onSelect,
  onCreate,
  onDelete,
  onBack,
}: {
  tree: TreeNode | null;
  repoRoot: string;
  onSelect: (path: string, branch: string) => void;
  onCreate: (parentPath: string, parentBranch: string) => void;
  onDelete: (path: string, branch: string) => void;
  onBack?: () => void;
}) {
  if (!tree) return null;

  const items = flatten(tree);

  return (
    <div className="h-full flex flex-col">
      <TitleBar title="Worktrees" onBack={onBack} />
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item) => (
            <WorktreeCard
              key={item.worktree.path}
              item={item}
              repoRoot={repoRoot}
              onSelect={onSelect}
              onCreate={onCreate}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TitleBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-10 pb-3 border-b border-zinc-800 app-drag">
      {onBack && (
        <button
          onClick={onBack}
          className="text-zinc-400 hover:text-zinc-200 text-sm app-no-drag"
        >
          &larr; Back
        </button>
      )}
      <h1 className="text-lg font-semibold text-zinc-200">{title}</h1>
    </div>
  );
}

function WorktreeCard({
  item,
  repoRoot,
  onSelect,
  onCreate,
  onDelete,
}: {
  item: FlatItem;
  repoRoot: string;
  onSelect: (path: string, branch: string) => void;
  onCreate: (parentPath: string, parentBranch: string) => void;
  onDelete: (path: string, branch: string) => void;
}) {
  const { worktree, depth, isRoot } = item;

  return (
    <div
      onClick={() => onSelect(worktree.path, worktree.branch)}
      className="group relative rounded-lg border border-zinc-800 bg-zinc-900 p-4 cursor-pointer
                 hover:border-zinc-600 hover:bg-zinc-800/80 transition-colors"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-sm font-medium text-cyan-400 truncate">
          {worktree.branch || "(detached)"}
        </span>
        {isRoot && (
          <span className="text-[10px] uppercase tracking-wider text-fuchsia-400 bg-fuchsia-400/10 px-1.5 py-0.5 rounded">
            root
          </span>
        )}
      </div>
      <div className="text-xs text-zinc-500 font-mono truncate mb-2">
        {shortenPath(worktree.path, repoRoot)}
      </div>
      {depth > 0 && (
        <div className="text-xs text-zinc-600">depth {depth}</div>
      )}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCreate(worktree.path, worktree.branch);
          }}
          className="text-xs text-zinc-400 hover:text-emerald-400 bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded"
          title="New child worktree"
        >
          +
        </button>
        {!isRoot && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete worktree "${worktree.branch}"?`)) {
                onDelete(worktree.path, worktree.branch);
              }
            }}
            className="text-xs text-zinc-400 hover:text-red-400 bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded"
            title="Delete worktree"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
}

export { TitleBar };
