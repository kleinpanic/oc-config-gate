/**
 * Discord approval card builder for oc-config-gate.
 * Produces OpenClaw ChannelStructuredComponents v2 format.
 */
import type { ValidationResult } from "./types.js";
/**
 * Build the Discord components v2 payload for the approval card.
 * Uses OpenClaw's documented Discord component spec. The Discord extension
 * turns callbackData into a registered native component interaction.
 */
export declare function buildApprovalCardComponents(params: {
    requestId: string;
    reason: string;
    diffLines: string[];
    validation: ValidationResult;
    expiresAt: string;
    restart?: boolean;
}, allowedUsers?: string[]): unknown;
/**
 * Build the text content for the approval card.
 */
export declare function buildApprovalCardText(params: {
    requestId: string;
    reason: string;
    diffLines: string[];
    validation: ValidationResult;
    expiresAt: string;
    restart?: boolean;
}): string;
//# sourceMappingURL=discord-card.d.ts.map