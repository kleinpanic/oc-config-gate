import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldBlockToolCall, registerConfigGuardHook } from "../dist/guard.js";

const CONFIG_PATH = `${process.env.HOME}/.openclaw/openclaw.json`;

function patchEnvelope(targetPath, marker = "Update File") {
  return [
    "*** Begin Patch",
    `*** ${marker}: ${targetPath}`,
    "@@",
    '-  "toolSearch": { "mode": "directory" }',
    '+  "toolSearch": { "mode": "code" }',
    "*** End Patch",
    "",
  ].join("\n");
}

/** Drive the real registered handler so the event -> decision wiring is covered. */
function callHook(event, ctx = { agentId: "school", toolName: event.toolName }) {
  let handler;
  registerConfigGuardHook(
    { logger: { info() {}, warn() {}, error() {} }, on: (_name, fn) => { handler = fn; } },
    ["meta"],
  );
  return handler(event, ctx);
}

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

// ─── Structured (non-exec) tool shapes ───────────────────────────────────────
// Each of the following was verified ALLOW against e77fc5c before the fix:
// CONFIG_WRITE_RE requires a shell verb plus a redirect/in-place token that no
// structured tool envelope contains, so both conjuncts of the path rule failed.

test("blocks apply_patch envelopes targeting the config, from the patch text alone", () => {
  for (const target of [CONFIG_PATH, "~/.openclaw/openclaw.json", ".openclaw/openclaw.json"]) {
    const result = shouldBlockToolCall({
      agentId: "school",
      toolName: "apply_patch",
      payload: { input: patchEnvelope(target) },
    });
    assert.equal(result.block, true, `expected block for ${target}`);
    assert.match(result.reason, /oc_config_stage/);
  }
});

test("blocks apply_patch Add File and Move to targets", () => {
  for (const marker of ["Add File", "Delete File", "Move to"]) {
    const result = shouldBlockToolCall({
      agentId: "school",
      toolName: "apply_patch",
      payload: { input: patchEnvelope(CONFIG_PATH, marker) },
    });
    assert.equal(result.block, true, `expected block for *** ${marker}`);
  }
});

test("blocks apply_patch on the host derivedPaths hint even when params are opaque", () => {
  const result = shouldBlockToolCall({
    agentId: "school",
    toolName: "apply_patch",
    payload: { input: "(opaque envelope the plugin cannot parse)" },
    derivedPaths: [CONFIG_PATH],
  });
  assert.equal(result.block, true);
  assert.match(result.reason, /oc_config_stage/);
});

test("blocks write and edit tools by path", () => {
  const write = shouldBlockToolCall({
    agentId: "school",
    toolName: "write",
    payload: { path: CONFIG_PATH, content: "{}" },
  });
  assert.equal(write.block, true);

  const edit = shouldBlockToolCall({
    agentId: "school",
    toolName: "edit",
    payload: {
      path: "~/.openclaw/openclaw.json",
      edits: [{ oldText: '"directory"', newText: '"code"' }],
    },
  });
  assert.equal(edit.block, true);
});

test("blocks file-target aliases the host recognises", () => {
  for (const key of ["file_path", "filePath", "filepath", "file", "oldPath", "destination"]) {
    const result = shouldBlockToolCall({
      agentId: "school",
      toolName: "some_writer",
      payload: { [key]: CONFIG_PATH },
    });
    assert.equal(result.block, true, `expected block for arg key ${key}`);
  }
});

test("blocks nested path args on unknown MCP-style write tools", () => {
  const result = shouldBlockToolCall({
    agentId: "school",
    toolName: "mcp__filesystem__write_file",
    payload: { operations: [{ target: {}, file_path: CONFIG_PATH, content: "{}" }] },
  });
  assert.equal(result.block, true);
});

test("blocks the gateway tool restart action", () => {
  const result = shouldBlockToolCall({
    agentId: "school",
    toolName: "gateway",
    payload: { action: "restart", delayMs: 0, reason: "picking up my change" },
  });
  assert.equal(result.block, true);
  assert.match(result.reason, /openclaw gateway restart --json/);
});

test("still allows reads of the config", () => {
  for (const toolName of ["read", "ls", "grep", "mcp__filesystem__read_text_file"]) {
    const result = shouldBlockToolCall({
      agentId: "school",
      toolName,
      payload: { path: CONFIG_PATH },
    });
    assert.equal(result.block, false, `expected allow for ${toolName}`);
  }
});

test("does not block writes to unrelated files", () => {
  const result = shouldBlockToolCall({
    agentId: "school",
    toolName: "write",
    payload: { path: `${process.env.HOME}/notes/todo.md`, content: "hi" },
  });
  assert.equal(result.block, false);
});

test("meta keeps its exemption across the new structured shapes", () => {
  for (const params of [
    { toolName: "apply_patch", payload: { input: patchEnvelope(CONFIG_PATH) } },
    { toolName: "write", payload: { path: CONFIG_PATH, content: "{}" } },
    { toolName: "gateway", payload: { action: "restart" } },
  ]) {
    assert.equal(shouldBlockToolCall({ agentId: "meta", ...params }).block, false);
  }
});

test("hook forwards derivedPaths and returns the host deny shape", () => {
  const blocked = callHook({
    toolName: "apply_patch",
    params: { input: "(opaque)" },
    derivedPaths: [CONFIG_PATH],
  });
  assert.equal(blocked.block, true);
  assert.equal(typeof blocked.blockReason, "string");
  assert.match(blocked.blockReason, /oc_config_stage/);

  const allowed = callHook({ toolName: "read", params: { path: CONFIG_PATH } });
  assert.equal(allowed, undefined);
});

test("hook resolves agentId from sessionKey for structured writes", () => {
  const blocked = callHook(
    { toolName: "write", params: { path: CONFIG_PATH, content: "{}" } },
    { sessionKey: "agent:school:discord:123", toolName: "write" },
  );
  assert.equal(blocked.block, true);
});
