/**
 * Pending config request state management.
 * Reads/writes ~/.openclaw/runtime/pending-config.json
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { PendingConfigRequest } from "./types.js";

function resolvePendingFile(): string {
  const explicit = process.env["OC_CONFIG_GATE_PENDING_FILE"];
  if (explicit) {
    return explicit;
  }
  const home = process.env.HOME ?? "/home/broklein";
  return path.join(home, ".openclaw", "runtime", "pending-config.json");
}

export function generateRequestId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export function hashConfig(config: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

export function writePending(req: PendingConfigRequest): void {
  const pendingFile = resolvePendingFile();
  fs.mkdirSync(path.dirname(pendingFile), { recursive: true });
  const tempFile = `${pendingFile}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(req, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempFile, pendingFile);
  fs.chmodSync(pendingFile, 0o600);
}

export function readPending(): PendingConfigRequest | null {
  try {
    const raw = fs.readFileSync(resolvePendingFile(), "utf8");
    return JSON.parse(raw) as PendingConfigRequest;
  } catch {
    return null;
  }
}

export function clearPending(): void {
  try {
    fs.unlinkSync(resolvePendingFile());
  } catch {
    // Already gone — fine
  }
}

export function isPendingExpired(req: PendingConfigRequest): boolean {
  return Date.now() > new Date(req.expiresAt).getTime();
}
