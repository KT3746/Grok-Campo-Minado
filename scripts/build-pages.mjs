#!/usr/bin/env node
/**
 * Static export for GitHub Pages.
 * Writes playable files into dist/ — never used by the Grok live preview.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const tmp = join(root, ".pages-export");

const result = spawnSync(
  process.execPath,
  ["scripts/with-app-env.mjs", "vite", "build", "--config", "vite.pages.config.ts"],
  { stdio: "inherit", cwd: root, env: { ...process.env, VITE_PAGES: "1" } },
);
if (result.status !== 0) process.exit(result.status ?? 1);

const clientDir = join(root, "dist/client");
if (!existsSync(clientDir)) {
  console.error("[build-pages] missing dist/client");
  process.exit(1);
}

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
for (const name of readdirSync(clientDir)) {
  if (name === "__grok") continue;
  cpSync(join(clientDir, name), join(tmp, name), { recursive: true });
}

const shell = join(tmp, "_shell.html");
const index = join(tmp, "index.html");
if (!existsSync(index) && existsSync(shell)) copyFileSync(shell, index);
if (!existsSync(index)) {
  console.error("[build-pages] no index.html or _shell.html");
  process.exit(1);
}
copyFileSync(index, join(tmp, "404.html"));
writeFileSync(join(tmp, ".nojekyll"), "");

rmSync(dist, { recursive: true, force: true });
cpSync(tmp, dist, { recursive: true });
rmSync(tmp, { recursive: true, force: true });

console.log("[build-pages] ready:", dist);
