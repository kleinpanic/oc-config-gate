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

test("blocks non-meta config writes through absolute or $HOME paths", () => {
  for (const cmd of [
    "sed -i 's/a/b/' $HOME/.openclaw/openclaw.json",
    "sed -i 's/a/b/' /root/.openclaw/openclaw.json",
    "echo '{}' >~/.openclaw/openclaw.json",
  ]) {
    const result = shouldBlockToolCall({ agentId: "school", toolName: "exec", payload: { command: cmd } });
    assert.equal(result.block, true, cmd);
  }
});

test("blocks non-meta config writes through file edit tools", () => {
  for (const [toolName, payload] of [
    ["write", { path: "/home/user/.openclaw/openclaw.json", content: "{}" }],
    ["edit", { path: "~/.openclaw/openclaw.json", oldText: "a", newText: "b" }],
    ["apply_patch", { input: "*** Begin Patch\n*** Update File: /home/user/.openclaw/openclaw.json\n@@\n-a\n+b\n*** End Patch" }],
  ]) {
    const result = shouldBlockToolCall({ agentId: "school", toolName, payload });
    assert.equal(result.block, true, toolName);
  }
});

test("does not block reads or unrelated files", () => {
  for (const [toolName, payload] of [
    ["read", { path: "/home/user/.openclaw/openclaw.json" }],
    ["exec", { command: "jq . ~/.openclaw/openclaw.json" }],
    ["write", { path: "/home/user/project/package.json", content: "{}" }],
    ["write", { path: "/home/user/notes/openclaw.json.md", content: "x" }],
  ]) {
    const result = shouldBlockToolCall({ agentId: "school", toolName, payload });
    assert.equal(result.block, false, `${toolName} ${JSON.stringify(payload)}`);
  }
});
