# Plugin API

`oc-config-gate` exposes two OpenClaw tools and one hook.

## `oc_config_stage`

Stages a proposed config change for Discord approval.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `patch` | object | yes | JSON Merge Patch (RFC 7396). Only include fields to change. `null` deletes a key. |
| `reason` | string | yes | Human-readable reason shown in the approval card and audit log. |
| `restart` | boolean | no | If `true`, approved apply requests `openclaw gateway restart --safe --wait 5m --json` after write/bless. |

### Example

```json
{
  "patch": {
    "gateway": {
      "reload": {
        "mode": "hybrid",
        "debounceMs": 300
      }
    }
  },
  "reason": "Enable validated config reload behavior",
  "restart": false
}
```

### Stage Behavior

1. Reads raw `openclaw.json` from disk.
2. Applies RFC 7396 merge patch.
3. Validates the merged result.
4. Produces a structural diff summary.
5. Writes `pending-config.json` atomically.
6. Posts a native Discord approval card with Approve/Deny buttons.

## `oc_config_apply`

Agent-facing status tool for the current pending request.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `requestId` | string | no | Request ID to verify against current pending state. |
| `action` | `"status"` | no | Only `status` is accepted for agent calls. |

`oc_config_apply` intentionally does not let agents apply or deny requests. Apply/deny is button-driven through the Discord interactive handler.

## `oc-config-gate-tool-guard`

`before_tool_call` hook that blocks unsafe operations for non-allowed agents.

Blocked patterns include:

- direct writes to `~/.openclaw/openclaw.json`
- OpenClaw config/update/restart RPC calls
- raw `systemctl --user restart openclaw-gateway.service`
- raw `pkill`/signal style OpenClaw process kills
- `openclaw gateway restart` calls from non-meta agents

Allowed agents are configured with `allowedAgentIds`.

