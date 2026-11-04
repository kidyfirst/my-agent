// Registers the `.js` -> `.ts` resolver hook for the current thread. Passed to a
// Worker via `execArgv: ["--import", <this file>]` so the thread can import the
// executor from source. Unused once the package is built.

import { register } from "node:module"

register("./ts-resolve-hook.mjs", import.meta.url)
