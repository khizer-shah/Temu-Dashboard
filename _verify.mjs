import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
// We can't import the .ts parser directly in node; replicate the public path by
// transpiling on the fly via a tiny shim is overkill. Instead, import the built
// logic by re-implementing the call through esbuild-less means: use tsx if present.
