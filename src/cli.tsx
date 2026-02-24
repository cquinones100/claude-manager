#!/usr/bin/env node
import React from "react"
import { render } from "ink"
import { App } from "./components/App.js"

process.stdout.write("\x1b[2J\x1b[H")

const { waitUntilExit } = render(<App />)
await waitUntilExit()
