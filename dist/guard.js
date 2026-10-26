// Matches openclaw.json under any directory prefix ($HOME, absolute, ~) but not
// look-alikes such as openclaw.json.bak or my-openclaw.json.
const CONFIG_PATH_RE = /(?<![\w.-])openclaw\.json(?![\w.-])/i;
const CONFIG_WRITE_RE = /\b(?:cat|cp|mv|tee|sed|perl|python3?|node|jq|printf|echo|ed|vi|vim|nano|truncate|install)\b[\s\S]*(?:>|--in-place|-i\b|rename|writeFile|writeFileSync|copyFile|copyFileSync|move)/i;
const GATEWAY_RESTART_RE = /\b(?:systemctl\s+--user\s+(?:restart|stop|kill|try-restart|reload-or-restart)\s+openclaw-gateway\.service|kill\s+-(?:USR1|TERM|KILL)|pkill\b[\s\S]*openclaw|openclaw\s+(?:gateway\s+)?(?:restart|stop|reload))\b/i;
// OpenClaw file tools that write their target path without a shell command.
const FILE_WRITE_TOOLS = new Set(["write", "edit", "apply_patch", "file_write", "multi_edit"]);
const FILE_PATH_KEYS = ["path", "file_path", "filePath", "file"];
// apply_patch file headers; OpenClaw trims each line before matching them.
const PATCH_TARGET_RE = /^[ \t]*\*\*\* (?:Add File|Delete File|Update File|Move to): (.*)$/gm;
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
/**
 * Target paths of a file-write tool call. Returns null when none are found so
 * the caller can fall back to scanning the whole payload.
 */
function fileToolTargets(payload) {
    if (!payload || typeof payload !== "object")
        return null;
    const record = payload;
    const targets = [];
    for (const key of FILE_PATH_KEYS) {
        const value = record[key];
        if (typeof value === "string")
            targets.push(value);
    }
    const input = record["input"];
    if (typeof input === "string") {
        for (const match of input.matchAll(PATCH_TARGET_RE))
            targets.push(match[1] ?? "");
    }
    return targets.length > 0 ? targets : null;
}
function isConfigFileWrite(toolName, payload, combined) {
    if (FILE_WRITE_TOOLS.has(toolName.toLowerCase())) {
        // Match the target path, not the content, which may just mention openclaw.json.
        const targets = fileToolTargets(payload);
        const writesConfig = targets
            ? targets.some((target) => CONFIG_PATH_RE.test(target.trim()))
            : CONFIG_PATH_RE.test(combined);
        if (writesConfig)
            return true;
    }
    return CONFIG_PATH_RE.test(combined) && CONFIG_WRITE_RE.test(combined);
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
    if (isConfigFileWrite(toolName, params.payload, combined)) {
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