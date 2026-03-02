import React from "react";
import { TitleBar } from "./WorktreeGrid";

type ProjectInfo = {
  repoRoot: string;
  displayName: string;
  displayPath: string;
  sessionCount: number;
  lastActivityAt: string;
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function ProjectGrid({
  projects,
  onSelect,
}: {
  projects: ProjectInfo[];
  onSelect: (project: ProjectInfo) => void;
}) {
  return (
    <div className="h-screen flex flex-col">
      <TitleBar title="Projects" />
      <div className="flex-1 overflow-auto p-4">
        {projects.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-zinc-400 text-lg mb-2">No projects found</div>
              <div className="text-zinc-600 text-sm">
                Claude session data is stored in ~/.claude/projects/
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.repoRoot}
                project={project}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onSelect,
}: {
  project: ProjectInfo;
  onSelect: (project: ProjectInfo) => void;
}) {
  return (
    <div
      onClick={() => onSelect(project)}
      className="group relative rounded-lg border border-zinc-800 bg-zinc-900 p-4 cursor-pointer
                 hover:border-zinc-600 hover:bg-zinc-800/80 transition-colors"
    >
      <div className="font-mono text-sm font-medium text-cyan-400 truncate mb-1">
        {project.displayName}
      </div>
      <div className="text-xs text-zinc-500 font-mono truncate mb-2">
        {project.displayPath}
      </div>
      <div className="text-xs text-zinc-600">
        {project.sessionCount} session{project.sessionCount !== 1 ? "s" : ""}
        {" · "}
        {formatRelativeTime(project.lastActivityAt)}
      </div>
    </div>
  );
}
