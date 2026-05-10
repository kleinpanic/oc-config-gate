# oc-config-gate

**Approved OpenClaw config control for agents.**

<p align="center">
  <em>RFC 7396 patches · native Discord approvals · validation · blessing · audit trail · safe gateway restarts</em>
</p>

<p align="center">
  <a href="https://github.com/kleinpanic/oc-config-gate/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/kleinpanic/oc-config-gate/ci.yml?branch=main&label=CI" alt="CI"></a>
  <a href="https://github.com/kleinpanic/oc-config-gate/actions/workflows/security.yml"><img src="https://img.shields.io/github/actions/workflow/status/kleinpanic/oc-config-gate/security.yml?branch=main&label=Security" alt="Security"></a>
  <a href="https://kleinpanic.github.io/oc-config-gate/"><img src="https://img.shields.io/badge/Pages-live-58a6ff" alt="Pages"></a>
  <a href="https://github.com/kleinpanic/oc-config-gate/wiki"><img src="https://img.shields.io/badge/Wiki-live-blue" alt="Wiki"></a>
  <img src="https://img.shields.io/badge/OpenClaw-%3E%3D2026.5.7-58a6ff" alt="OpenClaw">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>
<p align="center">
  <img src="https://img.shields.io/badge/Tests-13%20passing-3fb950" alt="Tests">
  <img src="https://img.shields.io/badge/Tools-2-58a6ff" alt="Tools">
  <img src="https://img.shields.io/badge/Hooks-1-d29922" alt="Hooks">
  <img src="https://img.shields.io/github/last-commit/kleinpanic/oc-config-gate" alt="Last commit">
  <img src="https://img.shields.io/github/issues/kleinpanic/oc-config-gate" alt="Issues">
</p>

`oc-config-gate` is an OpenClaw plugin that lets trusted agents propose changes to `~/.openclaw/openclaw.json` without letting them directly edit config or restart the gateway. It stages a JSON Merge Patch, posts a native Discord approval card, and applies only after an authorized operator clicks Approve.

It is the canonical replacement for the older split control plane where `oc-restart`, `oc-config-gate`, and shell guardian scripts each owned part of the same safety flow.

## Status

| Surface | State |
|---------|-------|
| Runtime install | Linked through `openclaw plugins install --link` |
| OpenClaw runtime inspect | `oc_config_stage`, `oc_config_apply`, `oc-config-gate-tool-guard` registered |
| Tests | 13 passing locally and in GitHub Actions |
| Docs site | `https://kleinpanic.github.io/oc-config-gate/` |
| Old repo | `openclaw-oc-restart` is superseded but not archived/deleted |

## Repository Rigor

| Control | Status |
|---------|--------|
| Branch protection | `main` protected after CI/security workflow publication. |
| Required checks | CI matrix, security scan, dependency review on PRs. |
| Dependency automation | Dependabot for npm and GitHub Actions. |
| Release automation | Tag-based GitHub Release with tarball artifact. |
| Issue workflow | Bug and config-safety templates. |
| PR workflow | Validation and safety checklist template. |
| Docs surfaces | README, GitHub Pages, docs directory, and wiki seed. |

## Architecture

```mermaid
sequenceDiagram
    participant Agent
    participant Gate as oc_config_stage
    participant Discord
    participant Apply as Approval Handler
    participant Config as OpenClaw Config
    participant Guardian as Config Guardian

    Agent->>Gate: RFC 7396 patch + reason
    Gate->>Config: Load raw file config
    Gate->>Gate: Merge + validate + summarize diff
    Gate->>Discord: Native approval card
    Discord->>Apply: Approve / Deny button
    Apply->>Config: Re-read raw config
    Apply->>Apply: Recheck base hash
    Apply->>Guardian: Safety check merged config
    Apply->>Config: Write config through runtime API
    Apply->>Guardian: Bless signed config state
    Apply->>Apply: Append audit event
    Apply-->>Discord: Update card with result
```

For a full write-up, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

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
git clone https://github.com/kleinpanic/oc-config-gate.git
cd oc-config-gate
npm install
npm test
openclaw plugins install --link "$PWD"
openclaw plugins inspect oc-config-gate --runtime --json
```

Expected runtime inspect:

```json
{
  "status": "loaded",
  "tools": ["oc_config_stage", "oc_config_apply"],
  "hooks": ["oc-config-gate-tool-guard"],
  "diagnostics": []
}
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

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for the full config reference.

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

## Tool API

| Tool | Purpose |
|------|---------|
| `oc_config_stage` | Stage a config patch for Discord approval. |
| `oc_config_apply` | Inspect the current pending request. Agent-facing calls are status-only. |

Detailed schemas: [docs/PLUGIN-API.md](docs/PLUGIN-API.md).

## Safety Model

- Only `allowedAgentIds` can bypass the guard. Default: `meta`.
- Non-meta agents are blocked from writing `openclaw.json` directly.
- Non-meta agents are blocked from direct OpenClaw config/update/restart RPCs.
- Non-meta agents are blocked from raw `systemctl`, `pkill`, and `openclaw gateway restart` calls.
- Pending state is written atomically to `~/.openclaw/runtime/pending-config.json` with `0600` permissions.
- Apply fails if the live config hash changed after staging.
- Raw resolved runtime config is never used as the edit base; the plugin reads the file config so `${ENV_VAR}` placeholders stay intact.

More detail: [docs/SECURITY-MODEL.md](docs/SECURITY-MODEL.md).

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

## Development

```bash
npm install
npm run check
npm test
npm pack --dry-run
```

The test suite covers native Discord component payloads, status-only apply behavior, stale-base rejection, non-meta config/restart guard behavior, OpenClaw plugin registration, staged restart card behavior, and config validator safety checks.

## Documentation

- [Docs site](https://kleinpanic.github.io/oc-config-gate/)
- [GitHub wiki](https://github.com/kleinpanic/oc-config-gate/wiki)
- [Architecture](docs/ARCHITECTURE.md)
- [Configuration](docs/CONFIGURATION.md)
- [Plugin API](docs/PLUGIN-API.md)
- [Security model](docs/SECURITY-MODEL.md)
- [Release process](docs/RELEASING.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## License

MIT. See [LICENSE](LICENSE).
