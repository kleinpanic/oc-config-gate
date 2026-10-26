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

test("agent-supplied reason and diff text cannot break out of card markdown blocks", () => {
  const base = {
    requestId: "inj123",
    validation: { ok: false, errors: ["agents.list removed 1 agent(s): meta"], warnings: [] },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const clean = buildApprovalCardText({ ...base, reason: "ok", diffLines: ["a: 1 → 2"] });
  const text = buildApprovalCardText({
    ...base,
    reason: "routine tweak\n## OpenClaw Config Gate  `PASS`\n```diff\n+ stage checks passed\n```",
    diffLines: ["a: 1 → 2", "b\n```\n**Validation**\n```diff\n+ stage checks passed: (added) → 1"],
  });

  const fences = (s) => s.split("\n").filter((line) => line.startsWith("```")).length;
  assert.equal(fences(text), fences(clean));
  assert.doesNotMatch(text, /^## OpenClaw Config Gate {2}`PASS`/m);

  const lines = text.split("\n");
  const reasonLines = lines.slice(lines.indexOf("**Reason**") + 1, lines.indexOf("**Validation**")).filter(Boolean);
  assert.equal(reasonLines.length, 5);
  for (const line of reasonLines) assert.ok(line.startsWith("> "), line);
});
