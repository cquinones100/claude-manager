import { open, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { execa } from "execa";
import type { ProjectInfo } from "./types.js";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const SUBAGENT_PATTERN = /subagent/i;

function shortenHome(absolutePath: string): string {
  const home = homedir();
  if (absolutePath.startsWith(home)) {
    return "~" + absolutePath.slice(home.length);
  }
  return absolutePath;
}

async function resolveRepoRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execa("git", ["-C", cwd, "rev-parse", "--show-toplevel"]);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function extractCwdFromFile(filePath: string): Promise<string | null> {
  try {
    const fd = await open(filePath, "r");
    try {
      // Read first 8KB — cwd appears in the first few lines
      const buf = Buffer.alloc(8192);
      const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
      const chunk = buf.subarray(0, bytesRead).toString("utf-8");
      for (const line of chunk.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          if (typeof parsed["cwd"] === "string") return parsed["cwd"];
        } catch {
          continue;
        }
      }
    } finally {
      await fd.close();
    }
  } catch {
    // skip unreadable files
  }
  return null;
}

async function extractCwdFromDir(dirPath: string): Promise<string | null> {
  const files = await readdir(dirPath).catch((): string[] => []);
  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl") && !SUBAGENT_PATTERN.test(f));

  for (const f of jsonlFiles) {
    const cwd = await extractCwdFromFile(join(dirPath, f));
    if (cwd) return cwd;
  }
  return null;
}

async function getSessionStats(dirPath: string): Promise<{ count: number; latestMtime: Date }> {
  const files = await readdir(dirPath).catch((): string[] => []);
  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl") && !SUBAGENT_PATTERN.test(f));

  let latestMtime = new Date(0);
  const stats = await Promise.all(
    jsonlFiles.map((f) => stat(join(dirPath, f)).catch(() => null)),
  );

  stats.forEach((s) => {
    if (s && s.mtime > latestMtime) {
      latestMtime = s.mtime;
    }
  });

  return { count: jsonlFiles.length, latestMtime };
}

export async function listProjects(): Promise<ProjectInfo[]> {
  const dirs = await readdir(CLAUDE_PROJECTS_DIR).catch((): string[] => []);

  const results = await Promise.all(
    dirs.map(async (dirName) => {
      const dirPath = join(CLAUDE_PROJECTS_DIR, dirName);
      const dirStat = await stat(dirPath).catch(() => null);
      if (!dirStat?.isDirectory()) return null;

      const cwd = await extractCwdFromDir(dirPath);
      if (!cwd) return null;

      const repoRoot = await resolveRepoRoot(cwd);
      if (!repoRoot) return null;

      const { count, latestMtime } = await getSessionStats(dirPath);
      if (count === 0) return null;

      return { repoRoot, count, latestMtime, dirName };
    }),
  );

  // Group by repo root, aggregate counts and latest activity
  const grouped = new Map<string, { sessionCount: number; lastActivityAt: Date }>();

  results.forEach((r) => {
    if (!r) return;
    const existing = grouped.get(r.repoRoot);
    if (existing) {
      existing.sessionCount += r.count;
      if (r.latestMtime > existing.lastActivityAt) {
        existing.lastActivityAt = r.latestMtime;
      }
    } else {
      grouped.set(r.repoRoot, {
        sessionCount: r.count,
        lastActivityAt: r.latestMtime,
      });
    }
  });

  const projects: ProjectInfo[] = [];

  grouped.forEach((data, repoRoot) => {
    projects.push({
      repoRoot,
      displayName: basename(repoRoot),
      displayPath: shortenHome(repoRoot),
      sessionCount: data.sessionCount,
      lastActivityAt: data.lastActivityAt,
    });
  });

  projects.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());

  return projects;
}
