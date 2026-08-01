import type {
  OpenClawPluginApi,
  PluginHookBeforeToolCallResult,
  PluginHookToolContext,
} from "./types.js";
import { isProtectedPath } from "./config-path.js";

const CONFIG_PATH_RE = /(?:^|\s|["'`])(?:~\/\.openclaw\/openclaw\.json|\/home\/broklein\/\.openclaw\/openclaw\.json|\.openclaw\/openclaw\.json|openclaw\.json)(?:\s|["'`]|$)/i;
const CONFIG_WRITE_RE = /\b(?:cat|cp|mv|tee|sed|perl|python3?|node|jq|printf|ed|vi|vim|nano|truncate|install)\b[\s\S]*(?:>|--in-place|-i\b|rename|writeFile|writeFileSync|copyFile|copyFileSync|move)/i;
const GATEWAY_RESTART_RE = /\b(?:systemctl\s+--user\s+(?:restart|stop|kill|try-restart|reload-or-restart)\s+openclaw-gateway\.service|kill\s+-(?:USR1|TERM|KILL)|pkill\b[\s\S]*openclaw|openclaw\s+(?:gateway\s+)?(?:restart|stop|reload))\b/i;
const CONFIG_RPC_RE = /\b(?:config\.(?:apply|patch|set|unset)|update\.run|gateway\.(?:restart|reload|stop))\b/i;
const DEFAULT_ALLOWED_AGENT_IDS = ["meta"];

// ─── Structured path detection ───────────────────────────────────────────────
// CONFIG_WRITE_RE above needs a shell verb plus a redirect/in-place token. A
// structured tool envelope (apply_patch's `input`, write's `path`+`content`,
// edit's `path`+`edits`) contains neither, so command-grammar matching alone
// lets every non-exec writer through. Everything below matches on PATH instead;
// the regexes stay as the fallback for exec/bash, where there is no structured
// path to read.

// Host-authoritative arg aliases that identify a file target on a mutating call
// (clone 0790d9f, src/agents/tool-mutation.ts:43-44). `newPath`/`new_path`/
// `destination`/`dest`/`notebook_path` are defensive additions for rename- and
// notebook-shaped envelopes the host does not classify today.
const PATH_ARG_KEYS = new Set(
  [
    "path",
    "file_path",
    "filePath",
    "filepath",
    "file",
    "oldPath",
    "old_path",
    "newPath",
    "new_path",
    "destination",
    "dest",
    "notebook_path",
    "notebookPath",
  ].map((key) => key.toLowerCase()),
);

// Tools that cannot write, so a protected path in their params is a read and
// must stay allowed. Sourced from the host's replay-safe set (clone 0790d9f,
// src/agents/tool-mutation.ts:90-110) plus the session read tools.
const READ_ONLY_TOOL_NAMES = new Set([
  "read",
  "ls",
  "grep",
  "find",
  "fd",
  "ripgrep",
  "glob",
  "pdf",
  "image",
  "agents_list",
  "get_goal",
  "memory_get",
  "memory_search",
  "sessions_history",
  "sessions_list",
  "tool_describe",
  "tool_search",
  "tool_search_code",
  "transcripts",
  "update_plan",
  "web_fetch",
  "web_search",
  "x_search",
]);

// Unknown/MCP tools are treated as writers unless their name reads as an
// accessor. Fail-closed: a false positive costs one read through an exotic
// tool (`read` still works); a false negative costs the config file.
const READ_ONLY_NAME_RE =
  /(?:^|[_.:-])(?:read|get|list|search|find|grep|glob|stat|cat|show|view|inspect|describe|fetch|query|lookup|status|diff|log|head|tail)(?:$|[_.:-])/i;

// The `gateway` tool reaches restart/config/update through a structured
// `action` discriminator, not a command string (clone 0790d9f,
// src/agents/tools/gateway-tool.ts:413-419). `config.apply`/`config.patch`/
// `update.run` already match CONFIG_RPC_RE by their literal action value;
// `restart` does not, so it needs the explicit action check.
const GATEWAY_TOOL_RESTART_ACTIONS = new Set(["restart"]);

const MAX_PARAM_SCAN_DEPTH = 8;

function isReadOnlyTool(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return READ_ONLY_TOOL_NAMES.has(normalized) || READ_ONLY_NAME_RE.test(normalized);
}

/** Collect every string sitting under a known file-target key, at any depth. */
function collectPathArgs(value: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > MAX_PARAM_SCAN_DEPTH || value === null || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) collectPathArgs(item, depth + 1, out);
    return out;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") {
      if (PATH_ARG_KEYS.has(key.toLowerCase())) out.push(entry);
      continue;
    }
    collectPathArgs(entry, depth + 1, out);
  }
  return out;
}

// apply_patch envelope markers. The host's own extractor walks exactly these
// (clone 0790d9f, src/agents/apply-patch-paths.ts:35-38, :140-195) and its
// output is only a hint — hook-types.ts:660-670 tells plugins to parse params
// themselves when a policy decision depends on the target set. It is also
// absent on hosts older than the derivedPaths change, and this plugin's peer
// floor is openclaw >=2026.5.7, so envelope parsing is the primary signal and
// derivedPaths is the corroborating one.
const PATCH_MARKER_RE = /^\s*\*\*\* (?:Add File|Update File|Delete File|Move to):[ \t]*(.+?)\s*$/;
const PATCH_TEXT_KEYS = new Set(["input", "patch", "diff", "patchtext", "patch_text"]);

function collectPatchTargetPaths(text: string): string[] {
  if (!text.includes("*** ")) return [];
  const paths: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = PATCH_MARKER_RE.exec(line);
    if (match?.[1]) paths.push(match[1]);
  }
  return paths;
}

/** Patch text can arrive as a bare string payload or under an `input`-ish key. */
function collectPatchArgs(value: unknown, depth = 0, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(...collectPatchTargetPaths(value));
    return out;
  }
  if (depth > MAX_PARAM_SCAN_DEPTH || value === null || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) collectPatchArgs(item, depth + 1, out);
    return out;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") {
      if (PATCH_TEXT_KEYS.has(key.toLowerCase())) out.push(...collectPatchTargetPaths(entry));
      continue;
    }
    collectPatchArgs(entry, depth + 1, out);
  }
  return out;
}

function readAction(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const action = (payload as Record<string, unknown>)["action"];
  return typeof action === "string" ? action.trim().toLowerCase() : "";
}
const CONFIG_GUIDANCE =
  "For config changes, stage an RFC 7396 patch with oc_config_stage; approving the Discord card automatically validates, writes, blesses, and audits.";
const RESTART_GUIDANCE =
  "For an operator-approved gateway restart, do not call systemd directly; ask meta to use the official OpenClaw service command: openclaw gateway restart --json.";

export interface GuardDecision {
  block: boolean;
  reason?: string;
}

function stringifyParams(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeAgentId(ctx: PluginHookToolContext): string {
  if (ctx.agentId) return ctx.agentId;
  // The host omits agentId on some paths but keeps sessionKey (buildToolContext,
  // agent-tools.before-tool-call.ts:1500-1504 — every field is a conditional spread).
  const match = ctx.sessionKey?.match(/^agent:([^:]+)/);
  return match?.[1] ?? "";
}

export function shouldBlockToolCall(params: {
  agentId?: string;
  toolName?: string;
  payload?: unknown;
  /**
   * Host-derived destination path hints from the before_tool_call event
   * (clone 0790d9f, src/plugins/hook-types.ts:660-671). Populated today only
   * for `apply_patch` (src/plugins/host-tool-param-parsers.ts:32-35) and
   * documented as a lenient hint, so it is treated as one signal among several
   * — never as the sole parse.
   */
  derivedPaths?: readonly string[];
  allowedAgentIds?: string[];
}): GuardDecision {
  const agentId = params.agentId ?? "";
  const allowedAgentIds = new Set(
    (params.allowedAgentIds && params.allowedAgentIds.length > 0
      ? params.allowedAgentIds
      : DEFAULT_ALLOWED_AGENT_IDS
    ).map((id) => id.trim()).filter(Boolean),
  );
  if (allowedAgentIds.has(agentId)) return { block: false };

  const toolName = params.toolName ?? "";
  const payload = stringifyParams(params.payload);
  const combined = `${toolName}\n${payload}`;

  if (CONFIG_RPC_RE.test(combined)) {
    return {
      block: true,
      reason: `Direct OpenClaw config/update/restart RPCs are blocked for non-meta agents. ${CONFIG_GUIDANCE} ${RESTART_GUIDANCE}`,
    };
  }

  // Path-based detection. Runs before the command-grammar fallback because a
  // structured envelope carries an exact target and needs no heuristics.
  if (!isReadOnlyTool(toolName)) {
    const candidatePaths = [
      ...(params.derivedPaths ?? []),
      ...collectPathArgs(params.payload),
      ...collectPatchArgs(params.payload),
    ];
    if (candidatePaths.some(isProtectedPath)) {
      return {
        block: true,
        reason: `Direct edits to ~/.openclaw/openclaw.json are blocked for non-meta agents (tool "${toolName || "unknown"}" targets the protected config path). ${CONFIG_GUIDANCE}`,
      };
    }
  }

  if (
    toolName.trim().toLowerCase() === "gateway" &&
    GATEWAY_TOOL_RESTART_ACTIONS.has(readAction(params.payload))
  ) {
    return {
      block: true,
      reason: `Direct gateway restarts are blocked for non-meta agents. ${RESTART_GUIDANCE}`,
    };
  }

  if (CONFIG_PATH_RE.test(combined) && CONFIG_WRITE_RE.test(combined)) {
    return {
      block: true,
      reason: `Direct edits to ~/.openclaw/openclaw.json are blocked for non-meta agents. ${CONFIG_GUIDANCE}`,
    };
  }

  if (GATEWAY_RESTART_RE.test(combined)) {
    return {
      block: true,
      reason: `Direct gateway restarts are blocked for non-meta agents. ${RESTART_GUIDANCE}`,
    };
  }

  return { block: false };
}

export function registerConfigGuardHook(api: OpenClawPluginApi, allowedAgentIds?: string[]): void {
  if (typeof api.on !== "function") {
    api.logger.warn("[oc-config-gate] api.on unavailable; config guard hook NOT installed");
    return;
  }

  api.on(
    "before_tool_call",
    (event, ctx): PluginHookBeforeToolCallResult | undefined => {
      const agentId = normalizeAgentId(ctx);
      const decision = shouldBlockToolCall({
        agentId,
        toolName: event.toolName,
        payload: event.params,
        ...(event.derivedPaths ? { derivedPaths: event.derivedPaths } : {}),
        allowedAgentIds,
      });
      if (!decision.block) return undefined;
      api.logger.warn("[oc-config-gate] blocked unsafe config/restart tool call", {
        agentId,
        toolName: event.toolName,
        reason: decision.reason,
      });
      return { block: true, blockReason: decision.reason };
    },
    // Typed-bus dispatch is priority-DESCENDING (hooks.ts:287), not registration
    // order. This is a deny gate: it must evaluate the params the model actually
    // proposed, before any lower-priority hook can rewrite them via the `params`
    // return. 1000 puts it above every other subscriber on this install
    // (gsd-oc:enforce-gate 100, gsd-oc:rigor-advisory 40).
    { priority: 1000 },
  );
}
