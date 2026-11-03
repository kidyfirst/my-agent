#!/usr/bin/env node

import { runCli } from "../src/cli.js"

runCli().catch((err) => {
	console.error("[My Agent CLI Error]:", err)
	process.exit(1)
})
