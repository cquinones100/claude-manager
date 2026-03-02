import { useState, useEffect, memo } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import Spinner from "ink-spinner";
import type { ProjectInfo } from "../types.js";
import { listProjects } from "../projects.js";
import { formatRelativeTime } from "../sessions.js";
import { Scrollbar } from "./scrollbar.js";

type ProjectListProps = {
  onSelect: (project: ProjectInfo) => void;
  onQuit: () => void;
};

function Shortcut({ keyName, description }: { keyName: string; description: string }) {
  return (
    <Text>
      <Text color="cyan">{keyName}</Text>
      <Text dimColor> {description}</Text>
    </Text>
  );
}

const COLS = 3;
const ROWS = 3;
const CHROME_LINES = 4;

type ProjectCardProps = {
  project: ProjectInfo;
  isSelected: boolean;
  width: number;
  height: number;
};

const ProjectCard = memo(function ProjectCard({ project, isSelected, width, height }: ProjectCardProps) {
  const borderColor = isSelected ? "cyan" : "gray";

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      width={width}
      height={height}
    >
      <Box flexShrink={0}>
        <Text bold={isSelected} color={isSelected ? "cyan" : undefined} wrap="truncate">
          {project.displayName}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text dimColor wrap="truncate">{project.displayPath}</Text>
      </Box>
      <Box flexShrink={0} marginTop={1}>
        <Text dimColor={!isSelected} wrap="truncate">
          {project.sessionCount} session{project.sessionCount !== 1 ? "s" : ""}
          <Text dimColor> · </Text>
          {formatRelativeTime(project.lastActivityAt)}
        </Text>
      </Box>
    </Box>
  );
});

function useTerminalSize() {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    width: stdout?.columns ?? 80,
    height: stdout?.rows ?? 24,
  });

  useEffect(() => {
    const onResize = () => {
      setSize({
        width: stdout?.columns ?? 80,
        height: stdout?.rows ?? 24,
      });
    };
    stdout?.on("resize", onResize);
    return () => { stdout?.off("resize", onResize); };
  }, [stdout]);

  return size;
}

export function ProjectList({ onSelect, onQuit }: ProjectListProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const cellWidth = Math.floor(termWidth / COLS);
  const cellHeight = Math.floor((termHeight - CHROME_LINES) / ROWS);

  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    listProjects().then((p) => {
      setProjects(p);
      setLoading(false);
    });
  }, []);

  useInput((input, key) => {
    if (loading) return;

    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(projects.length - 1, c + 1));
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - COLS));
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(projects.length - 1, c + COLS));
    }

    if (key.return) {
      const project = projects[cursor];
      if (project) onSelect(project);
    }
    if (input === "q") {
      onQuit();
    }
  });

  if (loading) {
    return (
      <Box padding={1}>
        <Text>
          <Spinner type="dots" /> Loading projects…
        </Text>
      </Box>
    );
  }

  if (projects.length === 0) {
    return (
      <Box padding={1} flexDirection="column">
        <Text>No projects found.</Text>
        <Text dimColor>Claude session data is stored in ~/.claude/projects/</Text>
      </Box>
    );
  }

  const totalRows = Math.ceil(projects.length / COLS);
  const cursorRow = Math.floor(cursor / COLS);
  const scrollRow = Math.max(0, Math.min(cursorRow - Math.floor(ROWS / 2), totalRows - ROWS));

  const visibleStart = scrollRow * COLS;
  const visibleEnd = Math.min(projects.length, (scrollRow + ROWS) * COLS);
  const visibleItems = projects.slice(visibleStart, visibleEnd);

  const rows: ProjectInfo[][] = [];
  for (let i = 0; i < visibleItems.length; i += COLS) {
    rows.push(visibleItems.slice(i, i + COLS));
  }

  return (
    <Box flexDirection="column" padding={1} height={termHeight}>
      <Text bold>Projects ({projects.length})</Text>
      <Box marginTop={1} flexGrow={1}>
        <Box flexDirection="column" flexGrow={1}>
          {rows.map((row, rowIdx) => (
            <Box key={scrollRow + rowIdx}>
              {row.map((project, colIdx) => {
                const globalIdx = visibleStart + rowIdx * COLS + colIdx;
                return (
                  <ProjectCard
                    key={project.repoRoot}
                    project={project}
                    isSelected={globalIdx === cursor}
                    width={cellWidth}
                    height={cellHeight}
                  />
                );
              })}
            </Box>
          ))}
        </Box>
        <Scrollbar
          totalItems={totalRows}
          visibleCount={ROWS}
          scrollOffset={scrollRow}
          height={ROWS * cellHeight}
        />
      </Box>
      <Box gap={2}>
        <Shortcut keyName="←↑↓→" description="navigate" />
        <Shortcut keyName="enter" description="select" />
        <Shortcut keyName="q" description="quit" />
      </Box>
    </Box>
  );
}
