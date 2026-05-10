# oc-config-gate Operator Skill

Use this skill when an OpenClaw agent needs to change `~/.openclaw/openclaw.json` or restart the gateway.

## Rules

- Do not edit `~/.openclaw/openclaw.json` directly from a non-meta agent.
- Do not call `systemctl --user restart openclaw-gateway.service` directly.
- Do not use deprecated `approve-restart`, `deny-restart`, `/restart-approve`, or `/restart-deny` commands.
- Use `oc_config_stage` for config changes.
- Use `restart: true` only when a full gateway restart is required after approval.
- Use `oc_config_apply` only to inspect pending request status; apply/deny is handled by Discord buttons.

## Stage Example

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
  "reason": "Enable validated hybrid config reload",
  "restart": false
}
```

## Restart Example

```json
{
  "patch": {
    "plugins": {
      "entries": {
        "some-plugin": {
          "enabled": true
        }
      }
    }
  },
  "reason": "Load newly installed plugin",
  "restart": true
}
```

Approval revalidates the live config base hash before writing. If the config changed after staging, stage a fresh request.

