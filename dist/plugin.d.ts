/**
 * oc-config-gate OpenClaw plugin entry point.
 *
 * Registers:
 *   - oc_config_stage tool (agent proposes a patch → Discord approval card)
 *   - oc_config_apply tool (check/manual-apply pending request)
 *   - Discord interactive handler for Approve/Deny buttons (namespace: oc-config-gate)
 */
declare const _default: {
    id: string;
    name: string;
    description: string;
    configSchema: import("openclaw/plugin-sdk/plugin-entry").OpenClawPluginConfigSchema;
    register: NonNullable<import("openclaw/plugin-sdk/plugin-entry").OpenClawPluginDefinition["register"]>;
} & Pick<import("openclaw/plugin-sdk/plugin-entry").OpenClawPluginDefinition, "kind" | "reload" | "nodeHostCommands" | "securityAuditCollectors">;
export default _default;
//# sourceMappingURL=plugin.d.ts.map