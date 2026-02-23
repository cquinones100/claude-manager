#!/usr/bin/env node
import React from "react"
import { render } from "ink"
import { spawnSync } from "node:child_process"
import { App } from "./components/App.js"

let resumeSessionId: string | null = null
let resumeCwd: string | undefined

const { waitUntilExit } = render(
  <App onResume={({ sessionId, cwd }) => { resumeSessionId = sessionId; resumeCwd = cwd }} />
)
await waitUntilExit()

if (resumeSessionId) {
  spawnSync("claude", ["--resume", resumeSessionId], {
    stdio: "inherit",
    cwd: resumeCwd,
  })
}
