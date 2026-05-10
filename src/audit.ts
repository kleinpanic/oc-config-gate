import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HOME = os.homedir();
const RUNTIME_DIR = path.join(HOME, ".openclaw", "runtime");
const AUDIT_PATH = path.join(RUNTIME_DIR, "oc-config-gate-audit.jsonl");
const GUARDIAN = path.join(HOME, ".openclaw", "hooks", "config-guardian.sh");

export function appendAudit(entry: Record<string, unknown>): void {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.appendFileSync(AUDIT_PATH, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, "utf8");
}

export async function blessConfig(reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await execFileAsync(GUARDIAN, ["--bless", "--editor", "oc-config-gate", "--reason", reason], {
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}

export async function safetyCheckConfig(
  config: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-config-gate-"));
  const tempPath = path.join(tempDir, "openclaw.json");
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await execFileAsync(GUARDIAN, ["--safety-check", tempPath], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function requestSafeGatewayRestart(
  reason: string,
): Promise<{ ok: true; output: string } | { ok: false; error: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "openclaw",
      ["gateway", "restart", "--safe", "--wait", "5m", "--json"],
      {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          OC_CONFIG_GATE_RESTART_REASON: reason,
        },
      },
    );
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}
