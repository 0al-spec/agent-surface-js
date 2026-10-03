# HTTP inline receipts source compatibility

2026-10-03 UTC. Explicit source-lock update from
`da550fde6f8be4ff0c1ded15524afb66c2912287` to merged ASP commit
`814084f4d7d06ac85be358ba84533d0718607746` ([PR #100](https://github.com/0al-spec/agent-surface/pull/100)).
Historical compatibility notes retain their original pins.

## Assessment

Core, delegated authorization and safe-effects bytes are unchanged. Privacy
changes only publication version/dependency metadata. Evidence adds the optional
HTTP inline receipt delivery profile plus matching publication metadata. Existing
unselected manifests and reference-only exchanges remain supported. Selecting the
descriptor changes the surface hash and therefore requires a matching new Grant;
the SDK does not issue one automatically.

The source-lock and independent compatibility regression expectations record:

| Module | SHA-256 |
| --- | --- |
| Core | `ec35cebe1b1fb718d7dc3c4c5b03350dd808e896842c97b165a3bf91f8814659` |
| Authorization | `463cfad1fb88ae97f2d496a9f61a27589885a7a07b85db1c0612a7a4feb5269d` |
| Privacy | `1d64270947f20ca62426f5ffe947024450b7a476ecdecc7653a4813315f98284` |
| Evidence | `255de1bb9b0587e7ded8a39bf2e2b5d0385c3c695b2a4a2d0d4581db592cd881` |
| Safe effects | `8d6566cd5864d64db5cff802b501a14b27965d74887eeab8461adf877183209e` |

## Implemented subset

Optional, closed `agent_api.receipt_delivery` selection for the sole non-persisted
proposal action; exact profile/action ID and `asp-jcs-sha-256` input hash selection.
The private offline experiment carries and validates complete unsigned Runtime/App
Receipts under the namespaced extension. Existing selected Grant validation requires
both local and app receipts. This is not full operational HTTP profile conformance:
transport, producer authentication, current authority, approval and signatures remain
host responsibilities or future work. MCP v1 is unchanged.

Regressions cover manifest selection, source-lock bytes, complete receipt integrity,
closed carriers, missing-carrier downgrade, correlation, mutation and bounded parsing.
