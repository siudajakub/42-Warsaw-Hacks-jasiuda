#!/usr/bin/env node
/** Copy assets Next intentionally leaves outside the standalone server tree. */

import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const copies = [
  [resolve(root, ".next/static"), resolve(root, ".next/standalone/.next/static")],
  [resolve(root, "public"), resolve(root, ".next/standalone/public")],
];

for (const [source, destination] of copies) {
  if (!existsSync(source)) continue;
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true });
}

process.stdout.write("Standalone assets prepared.\n");
