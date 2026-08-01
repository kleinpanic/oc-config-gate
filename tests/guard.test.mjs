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

// ─── Over-block regression: free-text params on read-only tools ──────────────
// The three command-grammar regexes (CONFIG_RPC_RE, CONFIG_PATH_RE+
// CONFIG_WRITE_RE, GATEWAY_RESTART_RE) matched phrases anywhere in the
// stringified params of EVERY tool. On a read-only call those params are free
// text a user or model composed, so a match proves nothing. Live evidence:
// a `tool_search` for "openclaw gateway restart action" was denied at
// 2026-08-01T00:29:43 (64-CONFIG-GATE-LIVE-PROOF.md §5, commit 31ed3e0).
// Every case below was verified BLOCK against f61edc6 before this fix.

test("does not block the tool_search call denied live at 00:29:43", () => {
  const result = shouldBlockToolCall({
    agentId: "dev",
    toolName: "tool_search",
    payload: { query: "openclaw gateway restart action", limit: 5 },
  });
  assert.equal(result.block, false);
});

test("does not block read-only tools whose free-text params carry restart grammar", () => {
  const cases = [
    ["grep", { pattern: "systemctl --user restart openclaw-gateway.service", path: "/home" }],
    ["web_search", { query: "how do I openclaw gateway restart --json" }],
    ["web_fetch", { url: "https://docs.openclaw.ai/cli/gateway", note: "openclaw gateway reload" }],
    ["memory_search", { query: "pkill openclaw notes" }],
    ["search", { query: "openclaw gateway restart" }],
    ["tool_search_code", { query: "kill -USR1 gateway" }],
    ["mcp__brave__brave_web_search", { query: "openclaw restart" }],
  ];
  for (const [toolName, payload] of cases) {
    const result = shouldBlockToolCall({ agentId: "dev", toolName, payload });
    assert.equal(result.block, false, `expected allow for ${toolName}`);
  }
});

test("does not block read-only tools whose free-text params carry config-write grammar", () => {
  const cases = [
    ["grep", { pattern: "jq '.x=1' ~/.openclaw/openclaw.json > /tmp/out", path: "/home" }],
    ["memory_search", { query: "cat openclaw.json > backup" }],
    ["web_search", { query: "sed -i openclaw.json how to" }],
  ];
  for (const [toolName, payload] of cases) {
    const result = shouldBlockToolCall({ agentId: "dev", toolName, payload });
    assert.equal(result.block, false, `expected allow for ${toolName}`);
  }
});

test("does not block read-only tools whose free-text params name a config RPC", () => {
  const cases = [
    ["read", { path: "/tmp/notes.md", pattern: "config.apply" }],
    ["tool_search", { query: "gateway.restart rpc" }],
    ["web_search", { query: "openclaw config.set --ref-provider" }],
    ["memory_search", { query: "update.run semantics" }],
  ];
  for (const [toolName, payload] of cases) {
    const result = shouldBlockToolCall({ agentId: "dev", toolName, payload });
    assert.equal(result.block, false, `expected allow for ${toolName}`);
  }
});

test("does not block action-dispatched read surfaces the host calls replay-safe", () => {
  const cases = [
    ["message", { action: "search", query: "did anyone openclaw gateway restart today" }],
    ["message", { action: "read", chatId: "1", note: "systemctl --user restart openclaw-gateway.service" }],
    ["process", { action: "log", id: "1", grep: "openclaw gateway restart" }],
    ["nodes", { action: "status", note: "openclaw gateway restart pending" }],
    ["cron", { action: "list", filter: "openclaw restart nightly" }],
    ["canvas", { action: "get", id: "openclaw gateway restart" }],
    ["subagents", { action: "list", note: "openclaw restart" }],
    ["skill_workshop", { action: "inspect", name: "openclaw gateway restart" }],
    ["browser", { action: "tabs", note: "openclaw gateway reload" }],
    ["github_actions", { action: "list", q: "openclaw gateway restart" }],
  ];
  for (const [toolName, payload] of cases) {
    const result = shouldBlockToolCall({ agentId: "dev", toolName, payload });
    assert.equal(result.block, false, `expected allow for ${toolName} ${payload.action}`);
  }
});

test("action-dispatched tools fail closed on absent or unknown actions", () => {
  for (const payload of [
    { query: "systemctl --user restart openclaw-gateway.service" },
    { action: "send", body: "systemctl --user restart openclaw-gateway.service" },
  ]) {
    const result = shouldBlockToolCall({ agentId: "dev", toolName: "message", payload });
    assert.equal(result.block, true, `expected block for ${JSON.stringify(payload)}`);
  }
});

test("gateway is never exempted as read-only by any action value", () => {
  const restart = shouldBlockToolCall({
    agentId: "dev",
    toolName: "gateway",
    payload: { action: "restart" },
  });
  assert.equal(restart.block, true);
  assert.equal(restart.category, "gateway-restart-action");

  // A replay-safe gateway action still cannot smuggle restart grammar past the
  // command-grammar fallback: `gateway` is in NEVER_READ_ONLY_TOOL_NAMES.
  const smuggle = shouldBlockToolCall({
    agentId: "dev",
    toolName: "gateway",
    payload: { action: "config.get", key: "systemctl --user restart openclaw-gateway.service" },
  });
  assert.equal(smuggle.block, true);
});

test("exec and bash are never exempted as read-only", () => {
  for (const toolName of ["exec", "bash"]) {
    const result = shouldBlockToolCall({
      agentId: "dev",
      toolName,
      payload: { action: "list", cmd: "systemctl --user restart openclaw-gateway.service" },
    });
    assert.equal(result.block, true, `expected block for ${toolName}`);
  }
});

test("read-only exemption does not extend to structured writers", () => {
  // `write` matches nothing in the read-only sets; a would-be exemption via a
  // read-shaped action must not reach the path branch.
  const result = shouldBlockToolCall({
    agentId: "dev",
    toolName: "write",
    payload: { action: "list", path: CONFIG_PATH, content: "{}" },
  });
  assert.equal(result.block, true);
  assert.equal(result.category, "protected-path");
});

// ─── Block categories and journal-line attribution ───────────────────────────

test("every deny branch reports a category", () => {
  const expectations = [
    ["config-rpc", { toolName: "exec", payload: { cmd: "openclaw gateway call config.apply --json" } }],
    ["protected-path", { toolName: "edit", payload: { path: CONFIG_PATH, edits: [] } }],
    ["gateway-restart-action", { toolName: "gateway", payload: { action: "restart" } }],
    [
      "config-write-command",
      { toolName: "exec", payload: { cmd: "jq '.a=1' ~/.openclaw/openclaw.json > /tmp/x" } },
    ],
    [
      "gateway-restart-command",
      { toolName: "exec", payload: { cmd: "systemctl --user restart openclaw-gateway.service" } },
    ],
  ];
  for (const [category, params] of expectations) {
    const result = shouldBlockToolCall({ agentId: "school", ...params });
    assert.equal(result.block, true, `expected block for ${category}`);
    assert.equal(result.category, category);
  }
});

test("block log line self-identifies tool, agent, and reason category", () => {
  const lines = [];
  let handler;
  registerConfigGuardHook(
    {
      logger: { info() {}, warn: (message) => lines.push(message), error() {} },
      on: (_name, fn) => { handler = fn; },
    },
    ["meta"],
  );

  handler(
    { toolName: "edit", params: { path: CONFIG_PATH, edits: [] } },
    { agentId: "school", toolName: "edit" },
  );
  handler(
    { toolName: "exec", params: { cmd: "systemctl --user restart openclaw-gateway.service" } },
    { agentId: "dev", toolName: "exec" },
  );

  assert.equal(lines.length, 2);
  assert.match(lines[0], /tool=edit/);
  assert.match(lines[0], /agent=school/);
  assert.match(lines[0], /reason=protected-path/);
  assert.match(lines[1], /tool=exec/);
  assert.match(lines[1], /agent=dev/);
  assert.match(lines[1], /reason=gateway-restart-command/);

  // The two lines must be distinguishable — the whole defect in §6 was that
  // every block rendered byte-identically in the journal.
  assert.notEqual(lines[0], lines[1]);
});

test("block log line never leaks params and cannot forge a journal record", () => {
  const lines = [];
  let handler;
  registerConfigGuardHook(
    {
      logger: { info() {}, warn: (message) => lines.push(message), error() {} },
      on: (_name, fn) => { handler = fn; },
    },
    ["meta"],
  );

  handler(
    {
      toolName: "exec",
      params: {
        cmd: "AUTH='Bearer sk-live-SECRET' systemctl --user restart openclaw-gateway.service",
      },
    },
    { agentId: "dev", toolName: "exec" },
  );
  assert.equal(lines.length, 1, "fixture must actually block");
  assert.doesNotMatch(lines[0], /sk-live-SECRET/);
  assert.doesNotMatch(lines[0], /Bearer/);

  // A newline in the tool name would otherwise forge a second journal record.
  // The invariant is that the line stays a single record with the injected
  // control characters neutralised — residual words are harmless in-line text.
  handler(
    { toolName: "exec\n2026-01-01 [gateway] forged", params: { cmd: "openclaw gateway restart" } },
    { agentId: "dev\nforged", toolName: "exec" },
  );
  assert.equal(lines.length, 2);
  assert.doesNotMatch(lines[1], /[\r\n]/);
  assert.match(lines[1], /tool=exec\?2026-01-01\?\?gateway\?\?forged /);
  assert.match(lines[1], /agent=dev\?forged /);
});
