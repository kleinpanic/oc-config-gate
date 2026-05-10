# oc-config-gate

**Approved OpenClaw config control for agents.**

<p align="center">
  <em>RFC 7396 patches · native Discord approvals · config validation · blessing · audit trail · safe gateway restarts</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/OpenClaw-%3E%3D2026.5.7-58a6ff" alt="OpenClaw">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

`oc-config-gate` is an OpenClaw plugin that lets trusted agents propose config changes without letting them directly edit `~/.openclaw/openclaw.json` or restart the gateway. It stages a JSON Merge Patch, posts a native Discord approval card, and applies only after an authorized operator clicks Approve.

It replaces the older split setup where `oc-restart`, `oc-config-gate`, and `config-guardian.sh` each owned part of the same control plane.

## What It Does

| Surface | Behavior |
|---------|----------|
| `oc_config_stage` | Stages an RFC 7396 config patch and posts an approval card. |
| Discord buttons | Approve applies; Deny discards. No token commands or slash fallback. |
| `before_tool_call` hook | Blocks non-meta direct config edits, config RPCs, and raw restarts. |
| Apply path | Rechecks base hash, validates, safety-checks, writes, blesses, audits. |
| Safe restart | Optional `restart: true` calls `openclaw gateway restart --safe --wait 5m --json` after bless. |

## Install

Local development install:

```bash
cd ~/codeWS/TypeScript/oc-config-gate
npm install
npm test
openclaw plugins install --link "$PWD" --force
openclaw plugins inspect oc-config-gate --runtime --json
```

Config entry:

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

## Usage

Stage a config patch from the meta agent:

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
  "reason": "Enable validated hybrid reload for config changes",
  "restart": false
}
```

For a change that needs a full gateway restart:

```json
{
  "patch": {
    "plugins": {
      "entries": {
        "example-plugin": {
          "enabled": true
        }
      }
    }
  },
  "reason": "Load newly installed plugin",
  "restart": true
}
```

Approval cards show the request ID, reason, validation status, change counts, diff preview, expiry, and apply behavior. Approve revalidates everything before writing.

## Safety Model

- Only `allowedAgentIds` can bypass the guard. Default: `meta`.
- Non-meta agents are blocked from writing `openclaw.json` directly.
- Non-meta agents are blocked from direct OpenClaw config/update/restart RPCs.
- Non-meta agents are blocked from raw `systemctl`, `pkill`, and `openclaw gateway restart` calls.
- Pending state is written atomically to `~/.openclaw/runtime/pending-config.json` with `0600` permissions.
- Apply fails if the live config hash changed after staging.
- Raw resolved runtime config is never used as the edit base; the plugin reads the file config so `${ENV_VAR}` placeholders stay intact.

## Development

```bash
npm install
npm run check
npm test
```

The test suite covers:

- native Discord component payloads
- status-only agent apply tool
- stale-base rejection
- non-meta config/restart guard behavior
- OpenClaw plugin registration
- staged restart card behavior
- config validator safety checks

## Prior Repo Parity

Ported from `openclaw-oc-restart`:

- Discord approval gate
- authorized-user approvals
- pending request state
- audit log writes
- direct restart blocking
- official restart flow after approval

Intentionally removed:

- `approve-restart` / `deny-restart` text tokens
- `/restart-approve` / `/restart-deny` slash commands
- raw shell restart fallback
- deprecated in-process monkeypatching of gateway test internals

## License

MIT. See [LICENSE](LICENSE).

