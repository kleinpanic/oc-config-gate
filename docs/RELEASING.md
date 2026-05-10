# Release Process

This repo is currently installed locally through OpenClaw's linked plugin path. GitHub is the canonical source; npm publishing can be added later.

## Local Release Checklist

```bash
npm install
npm run check
npm test
npm pack --dry-run
openclaw plugins install --link "$PWD"
openclaw config validate --json
openclaw plugins inspect oc-config-gate --runtime --json
```

Expected runtime:

- plugin status: `loaded`
- tools: `oc_config_stage`, `oc_config_apply`
- hook: `oc-config-gate-tool-guard`
- diagnostics: `[]`

## Versioning

Use semver:

- patch: docs/test/internal cleanup
- minor: new optional config/tool behavior
- major: breaking tool schema or config schema changes

Update:

- `package.json`
- `openclaw.plugin.json`
- `CHANGELOG.md`
- README status/examples if behavior changes

## Old Repo Disposition

The old `kleinpanic/openclaw-oc-restart` repo is superseded by this project but must not be deleted or archived without explicit operator approval.

Tracking issue:

- https://github.com/kleinpanic/oc-config-gate/issues/2

