# Contributing an adapter

Adapter authors are asking people to run declared actions inside signed-in web
sessions. A submission therefore needs to be understandable before it is
installable.

## Before opening a pull request

- Use one kebab-case id and save it as `adapters/<id>.json`.
- Scope `origins` to exact `http` or `https` origins. Wildcards and paths are rejected.
- Write tool names in snake_case and descriptions for the agent choosing the tool.
- Give every input property a description.
- Classify each tool as `READ`, `INTERACT`, `WRITE` or `DESTRUCTIVE`.
- Classify deletion and irreversible actions as `DESTRUCTIVE`.
- Use stable selectors such as `data-testid` or `data-action` where available.
- Verify each selector matches exactly one element at the point it runs.
- Set `verifiedAt` to the date you last exercised every tool.
- Increment `version` when updating an existing adapter.

Run the same deterministic check as CI:

```bash
npm test
```

Then complete the pull-request template, including reproducible manual test
steps. Do not add scripts, packages, binaries, recordings, credentials or
session data. A community submission consists only of its adapter JSON.

## Status in the Store

- **Community** is assigned automatically to accepted community submissions.
- **Official** is reserved for adapters maintained by Liha.
- **Verified** is maintainer-controlled and applies to one exact version.

`verifiedAt` records the author's last check. It does not grant the Store's
Verified badge by itself.
