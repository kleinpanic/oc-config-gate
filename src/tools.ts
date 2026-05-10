/**
 * Agent tools: oc_config_stage and oc_config_apply
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OpenClawPluginApi, PluginTool, PluginToolResult } from "./types.js";
import { applyMergePatch, summarizePatchPaths } from "./merge.js";
import { validateMergedConfig } from "./validate.js";
import { buildApprovalCardComponents, buildApprovalCardText } from "./discord-card.js";
import { appendAudit, blessConfig, requestSafeGatewayRestart, safetyCheckConfig } from "./audit.js";
import {
  generateRequestId,
  writePending,
  readPending,
  clearPending,
  isPendingExpired,
  hashConfig,
} from "./pending.js";

const DEFAULT_CHANNEL_ID = "1474492327748960378"; // #meta-openclaw
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 min

function text(t: string, isError = false): PluginToolResult {
  return { content: [{ type: "text", text: t }], isError };
}

function resolveConfigPath(): string {
  return process.env["OPENCLAW_CONFIG_PATH"]
    ?? join(process.env["HOME"] ?? process.cwd(), ".openclaw", "openclaw.json");
}

function loadRawConfigFile(): unknown {
  return JSON.parse(readFileSync(resolveConfigPath(), "utf8"));
}

// ─── oc_config_stage ──────────────────────────────────────────────────────────

export function createConfigStageTool(api: OpenClawPluginApi, pluginCfg: {
  approvalChannelId?: string;
  pendingTtlMs?: number;
  authorizedDiscordUserIds?: string[];
  allowGatewayRestart?: boolean;
}): PluginTool {
  return {
    name: "oc_config_stage",
    label: "oc_config_stage",
    description: [
      "Stage a proposed OpenClaw config change for Klein's approval.",
      "Accepts a JSON Merge Patch (RFC 7396) — only include fields you want to change.",
      "Null values delete keys. Validates the merged result, generates a diff,",
      "and posts a Discord approval card with Approve/Deny buttons.",
      "The config is NOT changed until Klein clicks Approve.",
      "On approval, the plugin automatically revalidates, safety-checks, writes, blesses, audits, and updates the Discord card.",
      "Set restart=true only when the change requires a full gateway restart after approval; the plugin will use OpenClaw's official safe gateway restart command, never raw systemctl.",
      "Use oc_config_apply only to check status or for local operator break-glass handling.",
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        patch: {
          type: "object",
          description:
            "JSON Merge Patch (RFC 7396). Only include keys you want to change. Null deletes a key.",
        },
        reason: {
          type: "string",
          description: "Human-readable reason for this change (shown in the approval card).",
        },
        restart: {
          type: "boolean",
          default: false,
          description: "Request an official safe gateway restart after approved write/bless. Requires approval.",
        },
      },
      required: ["patch", "reason"],
    },
    execute: async (_id, params) => {
      const patch = params["patch"];
      const reason = params["reason"];
      const restart = params["restart"] === true;

      if (typeof reason !== "string" || reason.trim().length === 0) {
        return text("reason is required and must be a non-empty string", true);
      }
      if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
        return text("patch must be a JSON object (RFC 7396 Merge Patch)", true);
      }
      if (restart && pluginCfg.allowGatewayRestart === false) {
        return text("restart=true is disabled by oc-config-gate.allowGatewayRestart", true);
      }

      // Load raw file config. runtime.config.loadConfig() resolves ${ENV_VAR}
      // placeholders to secret values, which is correct for runtime but unsafe
      // as an edit base.
      const runtime = api.runtime;

      let liveConfigRaw: unknown;
      try {
        liveConfigRaw = loadRawConfigFile();
      } catch (err) {
        return text(`Failed to load raw config file: ${err instanceof Error ? err.message : String(err)}`, true);
      }

      // Apply merge patch
      const mergedConfig = applyMergePatch(liveConfigRaw, patch as Record<string, unknown>);

      // Validate
      const validation = validateMergedConfig(liveConfigRaw, mergedConfig);

      // Generate diff summary
      const diffLines = summarizePatchPaths(liveConfigRaw, mergedConfig);

      // Build pending record
      const requestId = generateRequestId();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (pluginCfg.pendingTtlMs ?? DEFAULT_TTL_MS));

      const pending = {
        requestId,
        reason: reason.trim(),
        patch: patch as Record<string, unknown>,
        restart,
        diffText: diffLines.join("\n"),
        requestedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        baseHash: hashConfig(liveConfigRaw),
      };

      writePending(pending);

      // Post Discord approval card. The native in-process component path is required:
      // CLI-posted Discord components do not register a live interaction handler.
      const channelId = pluginCfg.approvalChannelId
        ?? process.env["OC_CONFIG_GATE_CHANNEL"]
        ?? DEFAULT_CHANNEL_ID;

      const cardText = buildApprovalCardText({
        requestId,
        reason: reason.trim(),
        diffLines,
        validation,
        expiresAt: expiresAt.toISOString(),
        restart,
      });

      const cardComponents = buildApprovalCardComponents(
        {
          requestId,
          reason: reason.trim(),
          diffLines,
          validation,
          expiresAt: expiresAt.toISOString(),
          restart,
        },
        pluginCfg.authorizedDiscordUserIds,
      );

      let postedMessageId: string | undefined;
      try {
        const adapter = await runtime?.channel?.outbound?.loadAdapter?.("discord");
        if (adapter?.sendPayload) {
          const result = await adapter.sendPayload({
            cfg: liveConfigRaw,
            to: `channel:${channelId}`,
            text: cardText,
            payload: {
              text: cardText,
              channelData: {
                discord: {
                  components: cardComponents,
                },
              },
            },
          });
          postedMessageId = result.messageId ?? result.id;
          // Store the message ID for later editing (approve/deny)
          const existing = readPending();
          if (existing?.requestId === requestId) {
            writePending({ ...existing, approvalMessageId: postedMessageId, approvalChannelId: channelId });
          }
        } else {
          return text("Discord outbound adapter is unavailable. Config was staged but cannot be approved safely from Discord; use oc_config_apply status and fix runtime.channel.outbound.loadAdapter(\"discord\") before applying.", true);
        }
      } catch (err) {
        api.logger.error("[oc-config-gate] Failed to post approval card", {
          error: err instanceof Error ? err.message : String(err),
        });
        return text(`Failed to post native Discord approval card: ${err instanceof Error ? err.message : String(err)}`, true);
      }

      const validSummary = validation.ok
        ? "Validation passed"
        : `${validation.errors.length} validation error(s): ${validation.errors.slice(0, 2).join("; ")}`;

      const lines = [
        `Staged config change \`${requestId}\``,
        `Reason: ${reason.trim()}`,
        `${diffLines.length} field(s) changed`,
        validSummary,
        validation.warnings.length > 0
          ? `⚠️ ${validation.warnings.length} warning(s): ${validation.warnings[0]}`
          : null,
        "",
        validation.ok
          ? `Native approval card posted to Discord channel ${channelId}. Klein must click Approve to apply.`
          : `Approval card posted — but Klein cannot approve until validation errors are fixed.`,
        restart ? "Approved apply will request an official safe gateway restart." : null,
        `Expires: ${expiresAt.toLocaleString("en-US", { timeZone: "America/New_York" })} ET`,
      ].filter(Boolean).join("\n");

      return text(lines);
    },
  };
}

// ─── oc_config_apply ──────────────────────────────────────────────────────────

export function createConfigApplyTool(_api: OpenClawPluginApi): PluginTool {
  return {
    name: "oc_config_apply",
    label: "oc_config_apply",
    description: [
      "Check the status of a staged config request, or perform local operator break-glass apply/deny.",
      "Normal flow is button-driven: Klein clicks the Discord Approve/Deny buttons and the plugin automatically applies, validates, blesses, audits, and updates the card.",
      "This tool does not run systemd restarts. If health/reload evidence proves a full restart is needed, meta should use openclaw gateway restart --json.",
      "Agent-facing calls are status-only; apply/deny require the Discord interaction handler.",
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        requestId: {
          type: "string",
          description: "Request ID from oc_config_stage. Omit to check the current pending request.",
        },
        action: {
          type: "string",
          enum: ["status"],
          description: "status = show current pending request. Default: status",
        },
      },
      required: [],
    },
    execute: async (_id, params) => {
      const action = (params["action"] as string | undefined) ?? "status";
      const reqId = params["requestId"] as string | undefined;

      const pending = readPending();

      if (!pending) {
        return text("No pending config request. Use oc_config_stage first.");
      }

      if (reqId && pending.requestId !== reqId) {
        return text(
          `Pending request is \`${pending.requestId}\`, not \`${reqId}\`. Only one request can be pending at a time.`,
          true,
        );
      }

      if (isPendingExpired(pending)) {
        clearPending();
        return text(`Pending request \`${pending.requestId}\` expired. Stage a new one.`, true);
      }

      if (action === "status") {
        const age = Math.round((Date.now() - new Date(pending.requestedAt).getTime()) / 1000 / 60);
        return text(
          [
            `Pending config request \`${pending.requestId}\``,
            `Reason: ${pending.reason}`,
            `Staged ${age}m ago`,
            `Expires: ${new Date(pending.expiresAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET`,
            `Changes: ${pending.diffText ? pending.diffText.split("\n").length : 0} field(s)`,
            `Restart: ${pending.restart ? "requested after approval" : "not requested"}`,
            "",
            "Waiting for Klein's Discord approval.",
          ].join("\n"),
        );
      }

      return text("oc_config_apply is status-only for agent calls. Approve or deny with the Discord buttons.", true);
    },
  };
}

// ─── Shared apply logic (used by both tool and Discord button handler) ────────

export async function doApply(
  pending: ReturnType<typeof readPending>,
  api: OpenClawPluginApi,
): Promise<PluginToolResult> {
  if (!pending) return text("No pending request", true);

  const runtime = api.runtime;
  if (!runtime?.config?.writeConfigFile || !runtime?.config?.loadConfig) {
    return text("runtime.config not available — cannot apply config", true);
  }

  // Final validation pass against the raw config file as it exists NOW.
  let liveConfigRaw: unknown;
  try {
    liveConfigRaw = loadRawConfigFile();
  } catch (err) {
    return text(`Cannot reload raw config for final check: ${err instanceof Error ? err.message : String(err)}`, true);
  }

  const liveHash = hashConfig(liveConfigRaw);
  if (pending.baseHash && pending.baseHash !== liveHash) {
    appendAudit({
      action: "apply-stale-base",
      requestId: pending.requestId,
      reason: pending.reason,
      baseHash: pending.baseHash,
      liveHash,
    });
    return text(
      [
        "❌ Config changed after this request was staged — config not written.",
        `Request: \`${pending.requestId}\``,
        "Stage a fresh oc_config_stage request against the current config.",
      ].join("\n"),
      true,
    );
  }

  const mergedConfig = applyMergePatch(liveConfigRaw, pending.patch);
  const finalValidation = validateMergedConfig(liveConfigRaw, mergedConfig);

  if (!finalValidation.ok) {
    const errs = finalValidation.errors.join("; ");
    return text(
      `❌ Final validation failed — config not applied.\nErrors: ${errs}\n\nFix the errors and stage a new request.`,
      true,
    );
  }

  const safetyCheck = await safetyCheckConfig(mergedConfig);
  if (!safetyCheck.ok) {
    appendAudit({
      action: "apply-safety-check-failed",
      requestId: pending.requestId,
      reason: pending.reason,
      error: safetyCheck.error,
    });
    return text(
      [
        "❌ Config safety check failed — config not written.",
        `Request: \`${pending.requestId}\``,
        `Error: ${safetyCheck.error}`,
        "",
        "Fix the staged patch and submit a new oc_config_stage request.",
      ].join("\n"),
      true,
    );
  }

  // Write config
  try {
    await runtime.config.writeConfigFile(mergedConfig);
  } catch (err) {
    return text(
      `Failed to write config: ${err instanceof Error ? err.message : String(err)}`,
      true,
    );
  }

  const bless = await blessConfig(`oc-config-gate: ${pending.reason}`);
  if (!bless.ok) {
    appendAudit({ action: "apply-bless-failed", requestId: pending.requestId, reason: pending.reason, error: bless.error });
    return text(`Config was written, but blessing failed: ${bless.error}`, true);
  }

  clearPending();
  appendAudit({ action: "apply", requestId: pending.requestId, reason: pending.reason, restart: pending.restart === true });

  const resultLines = [
    `✅ Config applied (request \`${pending.requestId}\`)`,
    `Reason: ${pending.reason}`,
    finalValidation.warnings.length > 0
      ? `⚠️ Warnings: ${finalValidation.warnings.join("; ")}`
      : null,
    pending.restart
      ? "Config blessed. Requesting official safe gateway restart now."
      : "Config blessed. Gateway reload behavior stays controlled by OpenClaw config; no restart was requested.",
  ].filter(Boolean);

  if (pending.restart) {
    const restart = await requestSafeGatewayRestart(pending.reason);
    if (restart.ok) {
      appendAudit({ action: "restart-requested", requestId: pending.requestId, reason: pending.reason });
      resultLines.push("Official safe gateway restart requested.");
      if (restart.output) resultLines.push(`Restart output: ${restart.output.slice(0, 500)}`);
    } else {
      appendAudit({ action: "restart-request-failed", requestId: pending.requestId, reason: pending.reason, error: restart.error });
      return text(
        [
          ...resultLines,
          "",
          "Config was written and blessed, but the official safe gateway restart request failed.",
          `Error: ${restart.error}`,
          "Use `openclaw gateway restart --safe --wait 5m --json` from meta/operator context after checking gateway health.",
        ].join("\n"),
        true,
      );
    }
  }

  const result = resultLines.join("\n");

  return text(result);
}
