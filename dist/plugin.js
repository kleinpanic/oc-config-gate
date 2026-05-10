/**
 * oc-config-gate OpenClaw plugin entry point.
 *
 * Registers:
 *   - oc_config_stage tool (agent proposes a patch → Discord approval card)
 *   - oc_config_apply tool (check/manual-apply pending request)
 *   - Discord interactive handler for Approve/Deny buttons (namespace: oc-config-gate)
 */
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createConfigStageTool, createConfigApplyTool, doApply } from "./tools.js";
import { readPending, clearPending, isPendingExpired } from "./pending.js";
import { registerConfigGuardHook } from "./guard.js";
export default definePluginEntry({
    id: "oc-config-gate",
    name: "Config Gate",
    description: "Gated OpenClaw config patching with Discord approval and safe restart",
    register(api) {
        const gateApi = api;
        const rawCfg = (gateApi.pluginConfig ?? {});
        if (rawCfg.enabled === false) {
            gateApi.logger.info("[oc-config-gate] disabled via config");
            return;
        }
        const pluginCfg = {
            approvalChannelId: rawCfg.approvalChannelId,
            pendingTtlMs: rawCfg.pendingTtlMs ?? 30 * 60 * 1000,
            restartDelayMs: rawCfg.restartDelayMs ?? 5000,
            allowGatewayRestart: rawCfg.allowGatewayRestart ?? true,
            authorizedDiscordUserIds: rawCfg.authorizedDiscordUserIds ?? ["1014431070059503699"],
            allowedAgentIds: rawCfg.allowedAgentIds ?? ["meta"],
        };
        // ─── Register agent tools ───────────────────────────────────────────────
        registerConfigGuardHook(gateApi, pluginCfg.allowedAgentIds);
        gateApi.registerTool(createConfigStageTool(gateApi, pluginCfg));
        gateApi.registerTool(createConfigApplyTool(gateApi));
        // ─── Register Discord interactive handler for button clicks ────────────
        gateApi.registerInteractiveHandler({
            channel: "discord",
            namespace: "oc-config-gate",
            handler: async (ctx) => {
                const authorizedDiscordUserIds = new Set(pluginCfg.authorizedDiscordUserIds);
                const authorizedByConfig = Boolean(ctx.senderId && authorizedDiscordUserIds.has(ctx.senderId));
                if (!ctx.auth.isAuthorizedSender && !authorizedByConfig) {
                    await ctx.respond.reply({
                        text: "⛔ Not authorized.",
                        ephemeral: true,
                    });
                    return { handled: true };
                }
                // Payload format: "approve:<requestId>" or "deny:<requestId>"
                const [action, requestId] = ctx.interaction.payload.split(":");
                if (!requestId) {
                    await ctx.respond.reply({
                        text: "⚠️ Malformed interaction payload — missing requestId.",
                        ephemeral: true,
                    });
                    return { handled: true };
                }
                const pending = readPending();
                if (!pending) {
                    await ctx.respond.editMessage({ text: "⚠️ No pending config request found (may have already been applied or expired)." });
                    return { handled: true };
                }
                if (pending.requestId !== requestId) {
                    await ctx.respond.reply({
                        text: `⚠️ This approval card is for request \`${requestId}\` but the current pending request is \`${pending.requestId}\`.`,
                        ephemeral: true,
                    });
                    return { handled: true };
                }
                if (isPendingExpired(pending)) {
                    clearPending();
                    await ctx.respond.editMessage({ text: `⏰ Request \`${requestId}\` expired and was discarded.` });
                    return { handled: true };
                }
                // ── Deny ────────────────────────────────────────────────────────────
                if (action === "deny") {
                    clearPending();
                    await ctx.respond.editMessage({
                        text: `❌ Config request \`${requestId}\` denied and discarded.\nReason was: ${pending.reason}`,
                    });
                    gateApi.logger.info(`[oc-config-gate] Request ${requestId} denied by ${ctx.senderUsername ?? ctx.senderId}`);
                    return { handled: true };
                }
                // ── Approve ─────────────────────────────────────────────────────────
                if (action === "approve") {
                    // Edit the card to show "applying..." immediately (Discord ACK)
                    await ctx.respond.editMessage({
                        text: `⏳ Applying config \`${requestId}\`: validating, safety-checking, writing, blessing, and auditing...`,
                    });
                    // Apply
                    const result = await doApply(pending, gateApi);
                    const resultText = result.content[0]?.text ?? "(no result)";
                    if (result.isError) {
                        await ctx.respond.editMessage({ text: `❌ Apply failed:\n${resultText}` });
                    }
                    else {
                        await ctx.respond.clearComponents({ text: resultText });
                    }
                    gateApi.logger.info(`[oc-config-gate] Request ${requestId} approved by ${ctx.senderUsername ?? ctx.senderId}`);
                    return { handled: true };
                }
                await ctx.respond.reply({ text: `Unknown action "${action}"`, ephemeral: true });
                return { handled: true };
            },
        });
        gateApi.logger.info("[oc-config-gate] Plugin registered — oc_config_stage, oc_config_apply, Discord handler");
    },
});
//# sourceMappingURL=plugin.js.map