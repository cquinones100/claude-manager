#!/usr/bin/env node
import React from "react"
import { render } from "ink"
import { App } from "./components/App.js"
import { PtyManager, killExistingSession } from "./pty-manager.js"
import { ResumeTarget } from "./types.js"

const ptyManager = new PtyManager()

const cleanup = () => ptyManager.killAll()
process.on("exit", cleanup)
process.on("SIGINT", () => {
  cleanup()
  process.exit(130)
})
process.on("SIGTERM", () => {
  cleanup()
  process.exit(143)
})

let running = true

while (running) {
  process.stdout.write("\x1b[2J\x1b[H")

  let resumeTarget: ResumeTarget | undefined

  const { waitUntilExit } = render(
    <App
      onResume={(target) => {
        resumeTarget = target
      }}
      activeWindows={ptyManager.ids()}
      onKillWindow={(id) => ptyManager.kill(id)}
    />,
  )

  await waitUntilExit()

  if (!resumeTarget) {
    running = false
    continue
  }

  const { sessionId, cwd, prompt, label } = resumeTarget

  if (!ptyManager.has(sessionId)) {
    killExistingSession(sessionId)
    const args = ["--resume", sessionId]
    if (prompt) {
      args.push("-p", prompt)
    }
    ptyManager.spawn(sessionId, cwd, args)
  }

  process.stdout.write("\x1b[2J\x1b[H")
  await ptyManager.attach(sessionId, label)
}

cleanup()
