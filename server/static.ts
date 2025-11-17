import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function serveStatic(app: Express) {
  // Resolve dist/public relative to the project root
  // In production with tsx, this file is at server/static.ts
  // So we go up one level to reach the project root, then into dist/public
  const distPath = fileURLToPath(new URL("../dist/public", import.meta.url));

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
