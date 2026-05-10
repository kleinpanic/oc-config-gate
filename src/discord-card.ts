/**
 * Discord approval card builder for oc-config-gate.
 * Produces OpenClaw ChannelStructuredComponents v2 format.
 */

import type { ValidationResult } from "./types.js";

const NAMESPACE = "oc-config-gate";

function summarizeDiffStats(diffLines: string[]): {
  total: number;
  added: number;
  removed: number;
  modified: number;
} {
  let added = 0;
  let removed = 0;
  let modified = 0;
  for (const line of diffLines) {
    if (line.includes("(added)")) {
      added += 1;
    } else if (line.includes("(deleted)")) {
      removed += 1;
    } else {
      modified += 1;
    }
  }
  return { total: diffLines.length, added, removed, modified };
}

function formatEt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatList(items: string[], limit: number): string[] {
  const shown = items.slice(0, limit);
  const lines = shown.map((item) => `- ${item}`);
  if (items.length > limit) {
    lines.push(`- ... ${items.length - limit} more`);
  }
  return lines;
}

function diffPreview(diffLines: string[], limit: number): string[] {
  if (diffLines.length === 0) {
    return ["# no structural changes detected"];
  }
  const shown = diffLines.slice(0, limit);
  if (diffLines.length > limit) {
    shown.push(`... ${diffLines.length - limit} more change(s) not shown`);
  }
  return shown;
}

/**
 * Build the Discord components v2 payload for the approval card.
 * Uses OpenClaw's documented Discord component spec. The Discord extension
 * turns callbackData into a registered native component interaction.
 */
export function buildApprovalCardComponents(
  params: {
    requestId: string;
    reason: string;
    diffLines: string[];
    validation: ValidationResult;
    expiresAt: string;
    restart?: boolean;
  },
  allowedUsers?: string[],
): unknown {
  const { requestId } = params;
  const allow = allowedUsers && allowedUsers.length > 0 ? allowedUsers : undefined;
  return {
    reusable: false,
    container: { accentColor: 0x3b82f6 },
    blocks: [
      {
        type: "actions",
        buttons: [
          {
            label: "Approve",
            style: "success",
            callbackData: `${NAMESPACE}:approve:${requestId}`,
            allowedUsers: allow,
          },
          {
            label: "Deny",
            style: "danger",
            callbackData: `${NAMESPACE}:deny:${requestId}`,
            allowedUsers: allow,
          },
        ],
      },
    ],
  };
}

/**
 * Build the text content for the approval card.
 */
export function buildApprovalCardText(params: {
  requestId: string;
  reason: string;
  diffLines: string[];
  validation: ValidationResult;
  expiresAt: string;
  restart?: boolean;
}): string {
  const { requestId, reason, diffLines, validation, expiresAt, restart } = params;
  const stats = summarizeDiffStats(diffLines);
  const status = validation.ok ? "PASS" : "BLOCKED";
  const accent = validation.ok ? "+" : "!";
  const lines: string[] = [
    `## OpenClaw Config Gate  \`${status}\``,
    `\`${requestId}\`  |  expires \`${formatEt(expiresAt)} ET\``,
    "",
    "**Reason**",
    `> ${reason}`,
    "",
    "**Validation**",
  ];

  if (validation.ok) {
    lines.push(
      "```diff",
      `${accent} stage checks passed`,
      `${accent} approval will recheck base hash`,
      `${accent} approval will safety-check, write, bless, and audit`,
      ...(restart ? [`${accent} approval will request an official safe gateway restart`] : []),
      "```",
    );
  } else {
    lines.push("```diff", `${accent} approval blocked`, "```");
    lines.push(...formatList(validation.errors, 8));
  }

  if (validation.warnings.length > 0) {
    lines.push("", "**Warnings**", ...formatList(validation.warnings, 5));
  }

  lines.push(
    "",
    "**Change Summary**",
    "```text",
    `changed  ${String(stats.total).padStart(3)}`,
    `added    ${String(stats.added).padStart(3)}`,
    `modified ${String(stats.modified).padStart(3)}`,
    `removed  ${String(stats.removed).padStart(3)}`,
    "```",
    "",
    "**Diff Preview**",
    "```diff",
    ...diffPreview(diffLines, 18),
    "```",
    "**Approval Behavior**",
    validation.ok
      ? restart
        ? "`Approve` applies through the gate: validate -> safety-check -> write -> bless -> audit -> official safe gateway restart. No raw `systemctl restart` is used."
        : "`Approve` applies through the gate: validate -> safety-check -> write -> bless -> audit. No raw `systemctl restart`; gateway reload behavior stays controlled by OpenClaw config."
      : "Fix validation errors, then stage a new request.",
  );

  return lines.join("\n");
}
