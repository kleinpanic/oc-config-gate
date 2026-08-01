import assert from "node:assert/strict";
import { test } from "node:test";
import plugin from "../dist/plugin.js";

function makeApi() {
  const state = { tools: [], typedHooks: [], internalHooks: [], handlers: [], warnings: [] };
  const api = {
    id: "oc-config-gate",
    logger: { info() {}, warn(msg, meta) { state.warnings.push({ msg, meta }); }, error() {}, debug() {} },
    pluginConfig: { allowedAgentIds: ["meta-openclaw-manager"] },
    config: {},
    runtime: {
      config: {
        loadConfig() { return {}; },
        async writeConfigFile() {},
      },
      channel: { outbound: { async loadAdapter() { return undefined; } } },
    },
    registerTool(tool) { state.tools.push(tool.name); },
    on(hookName, handler, opts) { state.typedHooks.push({ hookName, handler, opts }); },
    // The dead internal bus. Present only so the test can prove it is untouched.
    registerHook(events, handler, opts) { state.internalHooks.push({ events, handler, opts }); },
    registerInteractiveHandler(handler) { state.handlers.push(handler); },
  };
  return { api, state };
}

test("plugin registers tools, native guard hook, and Discord interaction handler", () => {
  const { api, state } = makeApi();

  plugin.register(api);

  assert.deepEqual(state.tools.sort(), ["oc_config_apply", "oc_config_stage"]);
  assert.equal(state.handlers.length, 1);
  assert.equal(state.handlers[0].channel, "discord");
  assert.equal(state.handlers[0].namespace, "oc-config-gate");
});

// Regression pin for the inert-guard defect: the guard was registered via
// api.registerHook, the internal hook bus, which never emits before_tool_call.
// Only api.on writes to registry.typedHooks, the array the dispatcher reads.
test("config guard is registered on the typed bus (api.on), never the internal bus", () => {
  const { api, state } = makeApi();

  plugin.register(api);

  assert.deepEqual(state.internalHooks, [], "guard must not touch api.registerHook");
  assert.equal(state.typedHooks.length, 1);
  assert.equal(state.typedHooks[0].hookName, "before_tool_call");
  assert.deepEqual(state.typedHooks[0].opts, { priority: 1000 });
});

test("guard denies with the host's blocking shape and allows by returning undefined", () => {
  const { api, state } = makeApi();
  plugin.register(api);
  const handler = state.typedHooks[0].handler;

  const denied = handler(
    { toolName: "exec", params: { cmd: "systemctl --user restart openclaw-gateway.service" } },
    { toolName: "exec", agentId: "school" },
  );
  // agent-tools.before-tool-call.ts:1633 reads exactly `.block` and `.blockReason`.
  assert.equal(denied.block, true);
  assert.match(denied.blockReason, /openclaw gateway restart --json/);
  assert.equal(state.warnings.at(-1).meta.agentId, "school");

  const allowed = handler(
    { toolName: "exec", params: { cmd: "systemctl --user restart openclaw-gateway.service" } },
    { toolName: "exec", agentId: "meta-openclaw-manager" },
  );
  assert.equal(allowed, undefined);
});

test("guard derives agentId from sessionKey when the host omits agentId", () => {
  const { api, state } = makeApi();
  plugin.register(api);
  const handler = state.typedHooks[0].handler;

  const denied = handler(
    { toolName: "exec", params: { cmd: "systemctl --user restart openclaw-gateway.service" } },
    { toolName: "exec", sessionKey: "agent:school:homework" },
  );
  assert.equal(denied.block, true);

  const allowed = handler(
    { toolName: "exec", params: { cmd: "systemctl --user restart openclaw-gateway.service" } },
    { toolName: "exec", sessionKey: "agent:meta-openclaw-manager:main" },
  );
  assert.equal(allowed, undefined);
});
