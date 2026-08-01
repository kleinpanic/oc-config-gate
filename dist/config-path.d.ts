/**
 * Canonical location of the OpenClaw config file.
 *
 * Mirrors the host's own resolution order (clone 0790d9f, src/utils.ts:80-102
 * resolveConfigDir): OPENCLAW_STATE_DIR wins, then the directory of
 * OPENCLAW_CONFIG_PATH, then $HOME/.openclaw. Kept in its own module so the
 * before_tool_call guard can protect this path without pulling the whole tool /
 * validate / audit graph into the hook hot path.
 */
/** Expand a leading `~`, `$HOME`, or `${HOME}` to the current home directory. */
export declare function expandHome(raw: string): string;
/** Absolute path of the live openclaw.json this install reads and writes. */
export declare function resolveConfigPath(): string;
/**
 * Paths no non-allowlisted agent may write through any tool.
 *
 * A list rather than a scalar so additional gate-critical files (bless state,
 * systemd drop-ins) can be added without touching the matcher.
 */
export declare function protectedPaths(): string[];
/**
 * True when `raw` names a protected file.
 *
 * Absolute (or `~`-rooted) candidates are compared after normalization.
 * Relative candidates cannot be resolved without the tool's cwd, which
 * before_tool_call does not carry, so they match on the `.openclaw/openclaw.json`
 * tail or on a bare `openclaw.json` — the same reach the pre-existing
 * command-string CONFIG_PATH_RE already had.
 */
export declare function isProtectedPath(raw: unknown): boolean;
//# sourceMappingURL=config-path.d.ts.map