## Summary

-

## Validation

- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm pack --dry-run`
- [ ] `openclaw plugins inspect oc-config-gate --runtime --json` if runtime behavior changed

## Safety Checklist

- [ ] No raw secrets, tokens, local runtime files, or pending config files committed
- [ ] No raw `systemctl` restart path added
- [ ] No token-command or slash-command approval fallback added
- [ ] Docs updated for tool/config/runtime behavior changes

