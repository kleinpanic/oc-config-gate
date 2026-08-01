import type {
  OpenClawPluginApi,
  PluginHookBeforeToolCallResult,
  PluginHookToolContext,
} from "./types.js";

const CONFIG_PATH_RE = /(?:^|\s|["'`])(?:~\/\.openclaw\/openclaw\.json|\/home\/broklein\/\.openclaw\/openclaw\.json|\.openclaw\/openclaw\.json|openclaw\.json)(?:\s|["'`]|$)/i;
const CONFIG_WRITE_RE = /\b(?:cat|cp|mv|tee|sed|perl|python3?|node|jq|printf|ed|vi|vim|nano|truncate|install)\b[\s\S]*(?:>|--in-place|-i\b|rename|writeFile|writeFileSync|copyFile|copyFileSync|move)/i;
const GATEWAY_RESTART_RE = /\b(?:systemctl\s+--user\s+(?:restart|stop|kill|try-restart|reload-or-restart)\s+openclaw-gateway\.service|kill\s+-(?:USR1|TERM|KILL)|pkill\b[\s\S]*openclaw|openclaw\s+(?:gateway\s+)?(?:restart|stop|reload))\b/i;
const CONFIG_RPC_RE = /\b(?:config\.(?:apply|patch|set|unset)|update\.run|gateway\.(?:restart|reload|stop))\b/i;
const DEFAULT_ALLOWED_AGENT_IDS = ["meta"];
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
