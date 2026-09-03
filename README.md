# Liha Adapter Registry

The community catalogue behind the **Liha Adapter Store**.

Each adapter is declarative JSON that adds named WebMCP tools to a website
without changing that website. Adapters cannot contain JavaScript, callbacks,
remote scripts or selector interpolation.

## Publish an adapter

1. Read [CONTRIBUTING.md](CONTRIBUTING.md).
2. Add `adapters/<adapter-id>.json` on a fork.
3. Run `npm test`.
4. Open a pull request using the adapter template.

Merged submissions appear as **Community** adapters. **Official** means Liha
maintains the adapter. **Verified** is granted separately after a maintainer
checks the exact adapter version against the live site.

## Repository outputs

- `adapters/*.json` — reviewable source definitions
- `catalog.json` — deterministic catalogue consumed by the Store
- `registry.json` — maintainer-controlled Official and Verified status

The validator is dependency-free and only reads JSON. Pull requests are checked
with the validator from the protected base branch, so contributed code is never
executed by CI.

## Related project

[Liha WebMCP Adapter](https://github.com/liha-app/webmcp-adapter) contains the
browser extension, runtime, Adapter Studio and Store UI.
