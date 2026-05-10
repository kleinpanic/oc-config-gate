# Contributing

`oc-config-gate` is a safety-critical OpenClaw plugin. Keep changes small, tested, and explicit about config/restart behavior.

## Development Setup

```bash
git clone https://github.com/kleinpanic/oc-config-gate.git
cd oc-config-gate
npm install
npm run check
npm test
```

## Repository Structure

```text
.github/workflows/     CI and security workflows
docs/                  Architecture, config, API, and release docs
skills/                Agent-facing usage guidance
src/                   TypeScript plugin source
tests/                 Node test runner tests
dist/                  Built plugin output for OpenClaw loading
openclaw.plugin.json   OpenClaw plugin manifest/config schema
```

## Change Rules

- Do not add token-command or slash-command approval fallbacks.
- Do not call raw `systemctl` from the plugin.
- Do not write `openclaw.json` by hand; use OpenClaw runtime config APIs.
- Preserve raw `${ENV_VAR}` placeholders; never write resolved secrets back to config.
- Add tests for every behavior change touching approval, guard, pending state, or restart behavior.

## Required Checks

```bash
npm run check
npm test
npm pack --dry-run
```

For runtime-sensitive changes:

```bash
openclaw plugins install --link "$PWD"
openclaw config validate --json
openclaw plugins inspect oc-config-gate --runtime --json
```

## Commit Style

Use Conventional Commits:

```text
feat: add approved restart flag
fix: reject stale pending config before write
docs: expand security model
test: cover non-meta restart guard
```

## Pull Request Expectations

- Keep PRs focused.
- Include validation evidence in the PR body.
- Update `CHANGELOG.md` for user-facing behavior changes.
- Update docs when tool schemas, config schema, or operational behavior changes.
- Do not include local runtime state, logs, pending config files, or secrets.

