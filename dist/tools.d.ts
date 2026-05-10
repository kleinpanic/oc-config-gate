/**
 * Agent tools: oc_config_stage and oc_config_apply
 */
import type { OpenClawPluginApi, PluginTool, PluginToolResult } from "./types.js";
import { readPending } from "./pending.js";
export declare function createConfigStageTool(api: OpenClawPluginApi, pluginCfg: {
    approvalChannelId?: string;
    pendingTtlMs?: number;
    authorizedDiscordUserIds?: string[];
    allowGatewayRestart?: boolean;
}): PluginTool;
export declare function createConfigApplyTool(_api: OpenClawPluginApi): PluginTool;
export declare function doApply(pending: ReturnType<typeof readPending>, api: OpenClawPluginApi): Promise<PluginToolResult>;
//# sourceMappingURL=tools.d.ts.map