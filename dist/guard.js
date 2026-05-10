const CONFIG_PATH_RE = /(?:^|\s|["'`])(?:~\/\.openclaw\/openclaw\.json|\/home\/broklein\/\.openclaw\/openclaw\.json|\.openclaw\/openclaw\.json|openclaw\.json)(?:\s|["'`]|$)/i;
const CONFIG_WRITE_RE = /\b(?:cat|cp|mv|tee|sed|perl|python3?|node|jq|printf|ed|vi|vim|nano|truncate|install)\b[\s\S]*(?:>|--in-place|-i\b|rename|writeFile|writeFileSync|copyFile|copyFileSync|move)/i;
const GATEWAY_RESTART_RE = /\b(?:systemctl\s+--user\s+(?:restart|stop|kill|try-restart|reload-or-restart)\s+openclaw-gateway\.service|kill\s+-(?:USR1|TERM|KILL)|pkill\b[\s\S]*openclaw|openclaw\s+(?:gateway\s+)?(?:restart|stop|reload))\b/i;
const CONFIG_RPC_RE = /\b(?:config\.(?:apply|patch|set|unset)|update\.run|gateway\.(?:restart|reload|stop))\b/i;
const DEFAULT_ALLOWED_AGENT_IDS = ["meta"];
const CONFIG_GUIDANCE = "For config changes, stage an RFC 7396 patch with oc_config_stage; approving the Discord card automatically validates, writes, blesses, and audits.";
const RESTART_GUIDANCE = "For an operator-approved gateway restart, do not call systemd directly; ask meta to use the official OpenClaw service command: openclaw gateway restart --json.";
function stringifyParams(value) {
    if (typeof value === "string")
        return value;
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
function normalizeAgentId(ctx) {
    const direct = ctx["agentId"];
    if (typeof direct === "string" && direct.length > 0)
        return direct;
    const sessionKey = ctx["sessionKey"];
    if (typeof sessionKey === "string") {
        const match = sessionKey.match(/^agent:([^:]+)/);
        if (match?.[1])
            return match[1];
    }
    return "";
}
export function shouldBlockToolCall(params) {
    const agentId = params.agentId ?? "";
    const allowedAgentIds = new Set((params.allowedAgentIds && params.allowedAgentIds.length > 0
        ? params.allowedAgentIds
        : DEFAULT_ALLOWED_AGENT_IDS).map((id) => id.trim()).filter(Boolean));
    if (allowedAgentIds.has(agentId))
        return { block: false };
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
export function registerConfigGuardHook(api, allowedAgentIds) {
    if (typeof api.registerHook !== "function") {
        api.logger.warn("[oc-config-gate] registerHook unavailable; config guard hook not installed");
        return;
    }
    api.registerHook("before_tool_call", (event, ctx) => {
        const eventRecord = event && typeof event === "object" ? event : {};
        const contextRecord = ctx ?? {};
        const toolName = typeof eventRecord["toolName"] === "string"
            ? eventRecord["toolName"]
            : typeof contextRecord["toolName"] === "string"
                ? contextRecord["toolName"]
                : "";
        const decision = shouldBlockToolCall({
            agentId: normalizeAgentId(contextRecord),
            toolName,
            payload: eventRecord["params"] ?? eventRecord,
            allowedAgentIds,
        });
        if (!decision.block)
            return undefined;
        api.logger.warn("[oc-config-gate] blocked unsafe config/restart tool call", {
            agentId: normalizeAgentId(contextRecord),
            toolName,
            reason: decision.reason,
        });
        return { block: true, blockReason: decision.reason };
    }, { name: "oc-config-gate-tool-guard", priority: 1000 });
}
//# sourceMappingURL=guard.js.map