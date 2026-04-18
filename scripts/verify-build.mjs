#!/usr/bin/env node

import fs from "fs";

const checks = [
  { path: "dist/index.js", label: "server bundle" },
  { path: "dist/public/index.html", label: "client entry html" },
  { path: "dist/public/assets", label: "client assets directory", optional: true },
];

let hasError = false;

for (const check of checks) {
  const exists = fs.existsSync(check.path);
  const marker = exists ? "OK" : "MISSING";
  console.log(`[verify-build] ${marker}: ${check.label} (${check.path})`);
  if (!exists && !check.optional) {
    hasError = true;
  }
}

if (hasError) {
  console.error("[verify-build] Build artifact verification failed");
  process.exit(1);
}

console.log("[verify-build] Build artifact verification passed");
