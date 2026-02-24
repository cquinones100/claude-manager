#!/usr/bin/env node
import React from "react"
import { render } from "ink"
import { spawnSync } from "node:child_process"
import { App } from "./components/App.js"
import { ResumeTarget } from "./types.js"

async function run() {
  let resumeTarget: ResumeTarget | null = null

  const { waitUntilExit } = render(
    <App onResume={(target) => { resumeTarget = target }} />
  )
  await waitUntilExit()

  return resumeTarget
}

let target: ResumeTarget | null = await run()

while (target) {
  const { sessionId, cwd, resumeMessage } = target
  const args = ["--resume", sessionId]
  if (resumeMessage) args.push(resumeMessage)
  spawnSync("claude", args, {
    stdio: "inherit",
    cwd,
  })

  target = await run()
}
