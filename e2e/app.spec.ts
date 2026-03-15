import { test, expect, ElectronApplication, Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import { join } from "path";
import { appendFileSync } from "fs";
import { createFixture, FixtureContext } from "./fixtures/setup";

let app: ElectronApplication;
let page: Page;
let fixture: FixtureContext;

test.beforeAll(async () => {
  fixture = createFixture();
});

test.afterAll(async () => {
  await app?.close();
  fixture?.cleanup();
});

test.beforeEach(async () => {
  if (app) await app.close();

  app = await electron.launch({
    args: [join(__dirname, "../out/main/index.js")],
    env: {
      ...process.env,
      CLAUDE_APP_DATA_DIR: fixture.appDataPath,
      CLAUDE_HOME_DIR: fixture.claudeHomePath,
    },
  });

  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

async function loadRepo() {
  const input = page.getByPlaceholder("Path to git project");
  await input.fill(fixture.repoPath);
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.getByText("2 worktrees")).toBeVisible();
}

const worktreeCardLocator = () =>
  page.getByRole("button", { name: /claude\/test-worktree/ });

test("shows idle state on launch", async () => {
  await expect(page.getByText("Enter a project path to list its worktrees.")).toBeVisible();
});

test("loads worktrees for a project path", async () => {
  await loadRepo();
  await expect(page.getByText("main", { exact: true })).toBeVisible();
  await expect(page.getByText("claude/test-worktree")).toBeVisible();
});

test("shows session preview on worktree cards", async () => {
  await loadRepo();
  // Both cards may show the preview; just verify at least one is visible
  await expect(page.getByText("Add unit tests to the project").first()).toBeVisible();
});

test("shows claude badge on worktree created by Claude", async () => {
  await loadRepo();
  await expect(worktreeCardLocator().locator("text=off main")).toBeVisible();
});

test("navigates to sessions on worktree click", async () => {
  await loadRepo();

  await worktreeCardLocator().click();
  await expect(page.getByText(/sessions in/i)).toBeVisible();
  await expect(page.getByText("Add unit tests to the project")).toBeVisible();
  await expect(page.getByText("claude-sonnet-4-6")).toBeVisible();
});

test("navigates back from sessions to worktree list", async () => {
  await loadRepo();

  await worktreeCardLocator().click();
  await expect(page.getByText(/sessions in/i)).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("2 worktrees")).toBeVisible();
});

test("navigates to chat history on session click", async () => {
  await loadRepo();

  await worktreeCardLocator().click();
  await expect(page.getByText(/sessions in/i)).toBeVisible();

  await page.getByRole("button", { name: /Add unit tests/ }).click();

  await expect(page.getByText("add unit tests to the project", { exact: true })).toBeVisible();
  await expect(
    page.getByText("I'll help you set up unit tests. Let me start by examining the project structure.")
  ).toBeVisible();
  await expect(page.getByText("looks good, go ahead")).toBeVisible();
});

test("chat history shows tool use badges", async () => {
  await loadRepo();

  await worktreeCardLocator().click();
  await page.getByRole("button", { name: /Add unit tests/ }).click();

  await expect(page.getByText("Read", { exact: true })).toBeVisible();
});

test("chat history filters out tool result messages", async () => {
  await loadRepo();

  await worktreeCardLocator().click();
  await page.getByRole("button", { name: /Add unit tests/ }).click();

  await expect(page.getByText("looks good, go ahead")).toBeVisible();
  await expect(page.getByText("file contents here")).not.toBeVisible();
});

test("shows error for invalid path", async () => {
  const input = page.getByPlaceholder("Path to git project");
  await input.fill("/nonexistent/path");
  await page.getByRole("button", { name: "Load" }).click();

  await expect(page.locator("text=/fatal|error|not a git/i")).toBeVisible();
});

test("submits path on Enter key", async () => {
  const input = page.getByPlaceholder("Path to git project");
  await input.fill(fixture.repoPath);
  await input.press("Enter");

  await expect(page.getByText("2 worktrees")).toBeVisible();
});

test("live updates chat history when JSONL file changes", async () => {
  await loadRepo();

  await worktreeCardLocator().click();
  await page.getByRole("button", { name: /Add unit tests/ }).click();

  // Verify initial messages are shown
  await expect(page.getByText("looks good, go ahead")).toBeVisible();

  // Verify new message is not yet present
  await expect(page.getByText("please also add integration tests")).not.toBeVisible();

  // Append a new message to the JSONL file
  const newMessage = {
    type: "user",
    isSidechain: false,
    message: { role: "user", content: "please also add integration tests" },
    uuid: "msg-7",
    timestamp: new Date().toISOString(),
    sessionId: "cli-session-1",
  };
  appendFileSync(fixture.sessionJsonlPath, JSON.stringify(newMessage) + "\n");

  // The watcher should pick up the change and update the view
  await expect(page.getByText("please also add integration tests")).toBeVisible({ timeout: 5000 });
});

test("live updates include new assistant messages", async () => {
  await loadRepo();

  await worktreeCardLocator().click();
  await page.getByRole("button", { name: /Add unit tests/ }).click();
  await expect(page.getByText("looks good, go ahead")).toBeVisible();

  // Append both a user message and an assistant response
  const userMsg = {
    type: "user",
    isSidechain: false,
    message: { role: "user", content: "what about snapshot tests?" },
    uuid: "msg-8",
    timestamp: new Date().toISOString(),
    sessionId: "cli-session-1",
  };
  const assistantMsg = {
    type: "assistant",
    isSidechain: false,
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Snapshot tests would be great for this component." }],
    },
    uuid: "msg-9",
    timestamp: new Date().toISOString(),
    sessionId: "cli-session-1",
  };
  appendFileSync(
    fixture.sessionJsonlPath,
    JSON.stringify(userMsg) + "\n" + JSON.stringify(assistantMsg) + "\n"
  );

  await expect(page.getByText("what about snapshot tests?")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Snapshot tests would be great for this component.")).toBeVisible();
});
