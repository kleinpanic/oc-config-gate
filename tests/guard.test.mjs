import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldBlockToolCall } from "../dist/guard.js";

test("blocks non-meta direct config writes", () => {
  const result = shouldBlockToolCall({
    agentId: "school",
    toolName: "exec",
    payload: { cmd: "jq '.foo=true' ~/.openclaw/openclaw.json > /tmp/x && mv /tmp/x ~/.openclaw/openclaw.json" },
  });
  assert.equal(result.block, true);
  assert.match(result.reason, /oc_config_stage/);
});

test("blocks non-meta gateway restarts", () => {
  const result = shouldBlockToolCall({
    agentId: "main",
    toolName: "exec",
    payload: { cmd: "systemctl --user restart openclaw-gateway.service" },
  });
  assert.equal(result.block, true);
  assert.match(result.reason, /openclaw gateway restart --json/);
  assert.match(result.reason, /do not call systemd directly/);
});

test("blocks official gateway restart for non-meta too", () => {
  const result = shouldBlockToolCall({
    agentId: "school",
    toolName: "exec",
    payload: { cmd: "openclaw gateway restart --json" },
  });
  assert.equal(result.block, true);
  assert.match(result.reason, /ask meta/);
});

test("allows meta to manage config", () => {
  const result = shouldBlockToolCall({
    agentId: "meta",
    toolName: "exec",
    payload: { cmd: "systemctl --user restart openclaw-gateway.service" },
  });
  assert.equal(result.block, false);
});

test("uses configured direct-change allowlist", () => {
  const result = shouldBlockToolCall({
    agentId: "meta-openclaw-manager",
    toolName: "exec",
    payload: { cmd: "systemctl --user restart openclaw-gateway.service" },
    allowedAgentIds: ["meta-openclaw-manager"],
  });
  assert.equal(result.block, false);
});

test("blocks non-meta native file tools that target the config file", () => {
  for (const [toolName, payload] of [
    ["write", { path: "/home/someone/.openclaw/openclaw.json", content: "{}" }],
    ["edit", { file_path: "~/.openclaw/openclaw.json", old_string: "a", new_string: "b" }],
    ["apply_patch", { input: "*** Begin Patch\n*** Update File: /root/.openclaw/openclaw.json\n*** End Patch" }],
  ]) {
    const result = shouldBlockToolCall({ agentId: "school", toolName, payload });
    assert.equal(result.block, true, toolName);
    assert.match(result.reason, /oc_config_stage/);
  }
});

test("blocks non-meta shell writes to the config via $HOME or other absolute paths", () => {
  for (const cmd of [
    "cp /tmp/x $HOME/.openclaw/openclaw.json",
    "cp /tmp/x /root/.openclaw/openclaw.json",
    "echo '{}' >~/.openclaw/openclaw.json",
    "jq . x > ~/.openclaw/openclaw.json;true",
  ]) {
    const result = shouldBlockToolCall({ agentId: "school", toolName: "exec", payload: { cmd } });
    assert.equal(result.block, true, cmd);
  }
});

test("still allows non-meta reads and writes of other files", () => {
  assert.equal(
    shouldBlockToolCall({ agentId: "school", toolName: "read", payload: { path: "~/.openclaw/openclaw.json" } }).block,
    false,
  );
  assert.equal(
    shouldBlockToolCall({ agentId: "school", toolName: "write", payload: { path: "/repo/openclaw.plugin.json", content: "{}" } }).block,
    false,
  );
  assert.equal(
    shouldBlockToolCall({ agentId: "school", toolName: "exec", payload: { cmd: "cat ~/.openclaw/openclaw.json | jq .agents" } }).block,
    false,
  );
});

test("native file tools are judged by target path, not by file contents", () => {
  for (const [toolName, payload] of [
    ["write", { path: "/repo/README.md", content: "Edit ~/.openclaw/openclaw.json via oc_config_stage" }],
    ["edit", { path: "/repo/docs/x.md", edits: [{ oldText: "a", newText: "see openclaw.json" }] }],
    ["apply_patch", { input: "*** Begin Patch\n*** Update File: docs/x.md\n+mentions openclaw.json\n*** End Patch" }],
  ]) {
    assert.equal(shouldBlockToolCall({ agentId: "school", toolName, payload }).block, false, toolName);
  }
  assert.equal(
    shouldBlockToolCall({
      agentId: "school",
      toolName: "apply_patch",
      payload: { input: "*** Begin Patch\n*** Update File: notes.md\n*** Move to: ~/.openclaw/openclaw.json\n*** End Patch" },
    }).block,
    true,
  );
});
