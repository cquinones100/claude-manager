import { useState, useEffect, type ReactNode } from "react";
import { Box, useInput, useStdout } from "ink";
import type { TreeNode } from "../types.js";
import { SideNav } from "./side-nav.js";

const MIN_SIDEBAR_WIDTH = 22;
const SIDEBAR_RATIO = 0.22;

type LayoutProps = {
  projectName: string;
  tree: TreeNode | null;
  currentWorktreePath: string | undefined;
  activeSessionIds: Set<string>;
  children: (contentWidth: number) => ReactNode;
};

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

export function Layout({
  projectName,
  tree,
  currentWorktreePath,
  activeSessionIds,
  children,
}: LayoutProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useInput((_input, key) => {
    if (key.tab) {
      setSidebarOpen((v) => !v);
    }
  });

  const sidebarWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.floor(termWidth * SIDEBAR_RATIO));
  const contentWidth = sidebarOpen ? termWidth - sidebarWidth : termWidth;

  return (
    <Box flexDirection="row" width={termWidth} height={termHeight}>
      {sidebarOpen && (
        <SideNav
          projectName={projectName}
          tree={tree}
          currentWorktreePath={currentWorktreePath}
          activeSessionIds={activeSessionIds}
          width={sidebarWidth}
          height={termHeight}
        />
      )}
      <Box flexGrow={1} width={contentWidth}>
        {children(contentWidth)}
      </Box>
    </Box>
  );
}
