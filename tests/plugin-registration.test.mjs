import assert from "node:assert/strict";
import { test } from "node:test";
import plugin from "../dist/plugin.js";

test("plugin registers tools, native guard hook, and Discord interaction handler", () => {
  const tools = [];
  const hooks = [];
  const handlers = [];
  const api = {
    id: "oc-config-gate",
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    pluginConfig: { allowedAgentIds: ["meta-openclaw-manager"] },
    config: {},
    runtime: {
      config: {
        loadConfig() { return {}; },
        async writeConfigFile() {},
      },
      channel: { outbound: { async loadAdapter() { return undefined; } } },
    },
    registerTool(tool) { tools.push(tool.name); },
    registerHook(events, handler, opts) { hooks.push({ events, handler, opts }); },
    registerInteractiveHandler(handler) { handlers.push(handler); },
  };

  plugin.register(api);

  assert.deepEqual(tools.sort(), ["oc_config_apply", "oc_config_stage"]);
  assert.equal(hooks.length, 1);
  assert.equal(hooks[0].events, "before_tool_call");
  assert.deepEqual(hooks[0].opts, { name: "oc-config-gate-tool-guard", priority: 1000 });
  assert.equal(handlers.length, 1);
  assert.equal(handlers[0].channel, "discord");
  assert.equal(handlers[0].namespace, "oc-config-gate");
});
