# Configuration Reference

`oc-config-gate` is configured through OpenClaw's plugin config system:

```json
{
  "plugins": {
    "entries": {
      "oc-config-gate": {
        "enabled": true,
        "approvalChannelId": "1474492327748960378",
        "pendingTtlMs": 1800000,
        "allowGatewayRestart": true,
        "authorizedDiscordUserIds": ["1014431070059503699"],
        "allowedAgentIds": ["meta"]
      }
    }
  }
}
```

## Fields

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Enables plugin registration. |
| `approvalChannelId` | string | `OC_CONFIG_GATE_CHANNEL` or local meta channel fallback | Discord channel ID where approval cards are posted. |
| `pendingTtlMs` | number | `1800000` | Pending request expiry in milliseconds. Default: 30 minutes. |
| `allowGatewayRestart` | boolean | `true` | Allows approved staged requests to call OpenClaw's official safe gateway restart command when `restart: true`. |
| `authorizedDiscordUserIds` | string[] | `["1014431070059503699"]` | Discord users allowed to approve or deny requests. |
| `allowedAgentIds` | string[] | `["meta"]` | Agents allowed to bypass the direct-edit guard. Other agents must stage patches. |
| `restartDelayMs` | number | `0` | Deprecated compatibility field. Restart scheduling is handled by OpenClaw's gateway command. |

## Recommended Policy

For a personal OpenClaw install:

- Keep `allowedAgentIds` narrow. Usually only `meta`.
- Keep `authorizedDiscordUserIds` to the operator account.
- Keep `allowGatewayRestart` enabled only if the operator wants approved config changes to be able to trigger a safe restart.
- Do not put tokens or API keys in plugin config.

## Validation

After changing config:

```bash
openclaw config validate --json
openclaw plugins inspect oc-config-gate --runtime --json
```

Expected runtime registration:

```json
{
  "plugin": { "status": "loaded" },
  "tools": [
    { "names": ["oc_config_stage"] },
    { "names": ["oc_config_apply"] }
  ],
  "customHooks": [
    { "name": "oc-config-gate-tool-guard" }
  ],
  "diagnostics": []
}
```

