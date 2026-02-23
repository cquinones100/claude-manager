#!/usr/bin/env node
import React from "react"
import { render } from "ink"
import { App } from "./components/App.js"

const { waitUntilExit } = render(<App />)
await waitUntilExit()
