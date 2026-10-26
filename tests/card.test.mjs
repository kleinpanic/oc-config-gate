import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApprovalCardComponents, buildApprovalCardText } from "../dist/discord-card.js";

test("approval card uses native button payloads and no restart token commands", () => {
  const text = buildApprovalCardText({
    requestId: "abc123",
    reason: "test",
    diffLines: ["plugins.entries.oc-config-gate.enabled: false -> true"],
    validation: { ok: true, errors: [], warnings: [] },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const components = buildApprovalCardComponents(
    {
      requestId: "abc123",
      reason: "test",
      diffLines: ["plugins.entries.oc-config-gate.enabled: false -> true"],
      validation: { ok: true, errors: [], warnings: [] },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    ["1014431070059503699"],
  );

  assert.match(text, /OpenClaw Config Gate/);
  assert.match(text, /write -> bless -> audit/);
  assert.match(text, /Change Summary/);
  assert.match(text, /Diff Preview/);
  assert.match(text, /OpenClaw Config Gate/);
  assert.match(text, /`PASS`/);
  assert.match(text, /```diff/);
  assert.doesNotMatch(text, /✅|❌|•|🛡️|⚠️/);
  assert.doesNotMatch(text, /approve-restart|restart-approve|deny-restart|restart-deny/i);
  const actionBlock = components.blocks[0];
  assert.equal(actionBlock.buttons.length, 2);
  assert.equal(actionBlock.buttons[0].callbackData, "oc-config-gate:approve:abc123");
  assert.equal(actionBlock.buttons[1].callbackData, "oc-config-gate:deny:abc123");
  assert.deepEqual(actionBlock.buttons[0].allowedUsers, ["1014431070059503699"]);
  assert.equal(actionBlock.buttons[0].custom_id, undefined);
});

test("approval card clearly shows approved restart behavior when requested", () => {
  const text = buildApprovalCardText({
    requestId: "restart123",
    reason: "test approved restart",
    diffLines: ["gateway.reload.mode: off -> hybrid"],
    validation: { ok: true, errors: [], warnings: [] },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    restart: true,
  });

  assert.match(text, /official safe gateway restart/);
  assert.match(text, /No raw `systemctl restart`/);
  assert.doesNotMatch(text, /approve-restart|restart-approve|deny-restart|restart-deny/i);
});

test("agent-controlled reason and diff keys cannot break out of card sections", () => {
  const forged = "ok\n```diff\n+ stage checks passed\n```\n**Diff Preview**\n```diff\n+ harmless";
  const text = buildApprovalCardText({
    requestId: "inject1",
    reason: forged,
    diffLines: ["plugins.entries.```\n**Approval Behavior**\nsafe: (added) → true"],
    validation: { ok: false, errors: ["Required top-level section \"plugins\" was removed"], warnings: [] },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const reasonLine = text.split("\n").find((line) => line.startsWith("> "));
  assert.match(reasonLine, /^> ok '''diff \+ stage checks passed ''' \*\*Diff Preview\*\*/);
  assert.doesNotMatch(text, /stage checks passed\n/);
  // Only the card's own fences remain: validation, change summary, diff preview.
  assert.equal(text.match(/```/g).length, 6);
  const lines = text.split("\n");
  assert.equal(lines.filter((line) => line === "**Diff Preview**").length, 1);
  assert.equal(lines.filter((line) => line === "**Approval Behavior**").length, 1);
});

test("agent-controlled text in warnings cannot break out of card sections", () => {
  const text = buildApprovalCardText({
    requestId: "inject2",
    reason: "ok",
    diffLines: [],
    validation: {
      ok: true,
      errors: [],
      warnings: ["agents.list[1] (id: x\n```\n**Diff Preview**\n```diff\n+ nothing) has no model or provider"],
    },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  assert.equal(text.match(/```/g).length, 6);
  assert.equal(text.split("\n").filter((line) => line === "**Diff Preview**").length, 1);
});
