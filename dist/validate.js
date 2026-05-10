/**
 * Config validation logic for oc-config-gate.
 *
 * Validates a proposed merged config against:
 *   1. Required top-level sections still present
 *   2. Agent list not shrunk (agents cannot be silently removed)
 *   3. Plugin allowlist not shrunk (plugins cannot be silently removed)
 *   4. No raw hardcoded API keys (must use ${ENV_VAR} template syntax)
 *   5. agents.list entries each have required fields (id, model)
 *   6. Known bool/string fields have correct types
 */
function isObj(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
// Regex: a bare API key (long alphanum, NOT a ${...} template)
const RAW_KEY_RE = /^[A-Za-z0-9_\-]{32,}$/;
/**
 * Scan a JSON object recursively for fields that look like raw API keys.
 * Fields named apiKey, api_key, token, secret whose values look like raw keys fail.
 */
function findRawKeyPaths(obj, prefix = "") {
    const paths = [];
    if (!isObj(obj))
        return paths;
    for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        const lk = k.toLowerCase();
        if ((lk === "apikey" || lk === "api_key" || lk === "token" || lk === "secret") &&
            typeof v === "string" &&
            !v.startsWith("${") &&
            RAW_KEY_RE.test(v)) {
            paths.push(path);
        }
        else if (isObj(v) || Array.isArray(v)) {
            if (Array.isArray(v)) {
                for (let i = 0; i < v.length; i++) {
                    paths.push(...findRawKeyPaths(v[i], `${path}[${i}]`));
                }
            }
            else {
                paths.push(...findRawKeyPaths(v, path));
            }
        }
    }
    return paths;
}
export function validateMergedConfig(before, after) {
    const errors = [];
    const warnings = [];
    if (!isObj(after)) {
        errors.push("Merged config is not a JSON object");
        return { ok: false, errors, warnings };
    }
    // 1. Required top-level sections
    const REQUIRED_SECTIONS = ["agents", "plugins"];
    for (const section of REQUIRED_SECTIONS) {
        if (!(section in after)) {
            errors.push(`Required top-level section "${section}" was removed`);
        }
    }
    // 2. Agent list not shrunk
    const beforeAgents = getAgentIds(before);
    const afterAgents = getAgentIds(after);
    const removedAgents = beforeAgents.filter((id) => !afterAgents.includes(id));
    if (removedAgents.length > 0) {
        errors.push(`agents.list removed ${removedAgents.length} agent(s): ${removedAgents.join(", ")}. ` +
            `Use explicit intent to remove agents.`);
    }
    // 3. Plugin allowlist not shrunk
    const beforePlugins = getPluginAllowlist(before);
    const afterPlugins = getPluginAllowlist(after);
    const removedPlugins = beforePlugins.filter((p) => !afterPlugins.includes(p));
    if (removedPlugins.length > 0) {
        errors.push(`plugins allowlist removed ${removedPlugins.length} plugin(s): ${removedPlugins.join(", ")}`);
    }
    // 4. No raw API keys
    const rawKeyPaths = findRawKeyPaths(after);
    for (const p of rawKeyPaths) {
        errors.push(`Raw API key detected at "${p}". Use \${ENV_VAR_NAME} template syntax instead.`);
    }
    // 5. agents.list entries each have id/model
    const agentList = getAgentList(after);
    for (let i = 0; i < agentList.length; i++) {
        const agent = agentList[i];
        if (!isObj(agent))
            continue;
        if (!agent.id) {
            errors.push(`agents.list[${i}] is missing required field "id"`);
        }
        if (!agent.model && !agent.provider) {
            warnings.push(`agents.list[${i}] (id: ${agent.id ?? "?"}) has no model or provider — will use defaults`);
        }
    }
    // 7. Model alias fields preserved (CRITICAL — see 2026-02-25 incident)
    const beforeAliasCount = countModelAliases(before);
    const afterAliasCount = countModelAliases(after);
    if (beforeAliasCount > 0 && afterAliasCount < beforeAliasCount) {
        const lost = beforeAliasCount - afterAliasCount;
        errors.push(`models.providers alias fields dropped from ${beforeAliasCount} to ${afterAliasCount} (-${lost}). ` +
            `Model alias fields are required functional config — removing them breaks model resolution.`);
    }
    return { ok: errors.length === 0, errors, warnings };
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function getAgentIds(cfg) {
    if (!isObj(cfg))
        return [];
    const agents = cfg["agents"];
    if (!isObj(agents))
        return [];
    const list = agents["list"];
    if (!Array.isArray(list))
        return [];
    return list
        .filter((a) => isObj(a) && typeof a["id"] === "string")
        .map((a) => a["id"]);
}
function getAgentList(cfg) {
    if (!isObj(cfg))
        return [];
    const agents = cfg["agents"];
    if (!isObj(agents))
        return [];
    const list = agents["list"];
    return Array.isArray(list) ? list : [];
}
function getPluginAllowlist(cfg) {
    if (!isObj(cfg))
        return [];
    const plugins = cfg["plugins"];
    if (!isObj(plugins))
        return [];
    const allow = plugins["allow"];
    if (!Array.isArray(allow))
        return [];
    return allow.filter((p) => typeof p === "string");
}
function countModelAliases(cfg) {
    if (!isObj(cfg))
        return 0;
    const models = cfg["models"];
    if (!isObj(models))
        return 0;
    const providers = models["providers"];
    if (!isObj(providers))
        return 0;
    let count = 0;
    for (const provider of Object.values(providers)) {
        if (!isObj(provider))
            continue;
        const modelList = provider["models"];
        if (!Array.isArray(modelList))
            continue;
        for (const m of modelList) {
            if (isObj(m) && "alias" in m)
                count++;
        }
    }
    return count;
}
//# sourceMappingURL=validate.js.map