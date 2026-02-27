#!/usr/bin/env node
import { render } from "ink";
import meow from "meow";
import { App } from "./app.js";

meow(
  `
  Usage
    $ claude-tree-vis

  Interactively manage Claude Code worktrees in the current git repo.
`,
  { importMeta: import.meta },
);

render(<App />);
