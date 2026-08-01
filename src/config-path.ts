/**
 * Canonical location of the OpenClaw config file.
 *
 * Mirrors the host's own resolution order (clone 0790d9f, src/utils.ts:80-102
 * resolveConfigDir): OPENCLAW_STATE_DIR wins, then the directory of
 * OPENCLAW_CONFIG_PATH, then $HOME/.openclaw. Kept in its own module so the
 * before_tool_call guard can protect this path without pulling the whole tool /
 * validate / audit graph into the hook hot path.
 */

import { homedir } from "node:os";
import { isAbsolute, join, normalize, resolve } from "node:path";

const CONFIG_FILE_NAME = "openclaw.json";

/** Expand a leading `~`, `$HOME`, or `${HOME}` to the current home directory. */
export function expandHome(raw: string): string {
  const home = process.env["HOME"] ?? homedir();
  if (raw === "~") return home;
  if (raw.startsWith("~/")) return home + raw.slice(1);
  if (raw === "$HOME" || raw === "${HOME}") return home;
  if (raw.startsWith("$HOME/")) return home + raw.slice("$HOME".length);
  if (raw.startsWith("${HOME}/")) return home + raw.slice("${HOME}".length);
  return raw;
}

/** Absolute path of the live openclaw.json this install reads and writes. */
export function resolveConfigPath(): string {
  const stateDir = process.env["OPENCLAW_STATE_DIR"]?.trim();
  if (stateDir) return resolve(expandHome(stateDir), CONFIG_FILE_NAME);

  const configPath = process.env["OPENCLAW_CONFIG_PATH"]?.trim();
  if (configPath) return resolve(expandHome(configPath));

  return join(process.env["HOME"] ?? homedir(), ".openclaw", CONFIG_FILE_NAME);
}

/**
 * Paths no non-allowlisted agent may write through any tool.
 *
 * A list rather than a scalar so additional gate-critical files (bless state,
 * systemd drop-ins) can be added without touching the matcher.
 */
export function protectedPaths(): string[] {
  return [resolveConfigPath()];
}

/**
 * True when `raw` names a protected file.
 *
 * Absolute (or `~`-rooted) candidates are compared after normalization.
 * Relative candidates cannot be resolved without the tool's cwd, which
 * before_tool_call does not carry, so they match on the `.openclaw/openclaw.json`
 * tail or on a bare `openclaw.json` — the same reach the pre-existing
 * command-string CONFIG_PATH_RE already had.
 */
export function isProtectedPath(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return false;

  const expanded = expandHome(trimmed);

  if (isAbsolute(expanded)) {
    const normalized = normalize(expanded);
    return protectedPaths().some((p) => normalize(p) === normalized);
  }

  const relative = normalize(expanded).replace(/\\/g, "/").replace(/^\.\//, "");
  return relative === CONFIG_FILE_NAME || relative.endsWith(`.openclaw/${CONFIG_FILE_NAME}`);
}
