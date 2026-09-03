## Adapter

- Adapter id:
- Target website:
- Maintainer GitHub handle:
- New adapter or update:

## What the tools let an agent do

Describe each user task represented by a tool.

## Capability review

- [ ] Every mutation is `WRITE` or `DESTRUCTIVE`.
- [ ] Every deletion or irreversible action is `DESTRUCTIVE`.
- [ ] `READ` tools do not submit forms or navigate.

## Manual verification

List the steps used to exercise every tool against every declared production
origin. Do not attach credentials or session data.

- Date tested:
- Browser and version:
- Result:

## Submission checklist

- [ ] I added or changed only `adapters/<id>.json`.
- [ ] The filename matches the adapter id.
- [ ] Origins are exact and belong to one service.
- [ ] Every input has a description.
- [ ] Stable selectors match exactly one element when their step runs.
- [ ] `npm test` passes and `catalog.json` is updated with `npm run build`.
- [ ] I understand that merged community adapters are not automatically Verified.
