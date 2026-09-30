# Host authentication and authority adapter selection

**Status: source inventory and proposed next contract; no adapter implemented.**
Inspected 2026-09-30 UTC. This selects a design candidate, not a qualified host,
approved public API, live integration, or authority to activate issuance.

## Decision

Use **Memos account plus server-backed refresh-session lifecycle** as the next
concrete authentication contract to design. Do not treat an access JWT, PAT,
generic process cookie, or SDK value as an exact ordinary account session.
Memos is a Go host: its lifecycle can inform language-neutral adapter obligations
and shared vectors, but Go authentication code is not being extracted into the
TypeScript SDK. A future TS host still needs its own qualified implementation.

This is a bounded design selection. No application changes, login added to
Calcu, Memos robustness/live tests, retention probes, issuer exports, credential
creation, source-lock change, or ADP/task/maturity updates are included.

## Inspected source and evidence

| Candidate | Authentication actually present | Missing authority/fence evidence | Decision |
| --- | --- | --- | --- |
| Calcu at `bb46989c61ff99a6e48e1615a7cf0f8672b80a54` | `server/taskHost.ts:14,194–228` gates the demo using a process-session cookie; `server/demo.ts:48` sets `calcu-demo-user`. | No ordinary account lifecycle established in the inspected demo. CLI authentication is not application User authentication. | Keep conditional; do not build a calculator login to satisfy the SDK experiment. |
| SpecSpace at `bd3de6137ebe5c2fa2c53079b699f6d9d18f89da` | `viewer/operator_auth.py` implements optional single-operator Basic authentication; `request_is_operator` allows requests when disabled. `viewer/server_runtime.py:683–724` configures the operator at startup. | No per-account revocable session or issuance transaction demonstrated. `operator_profile_ref` is credential-configuration-bound, not a durable account/session identity. | Possible separately scoped single-operator host, but not the simplest account/session adapter for this slice. |
| Memos at upstream `2b2192d4e153bd04f1d325b60fd880cf00d68b01` | Account resolution, server-backed refresh-token records, expiry checks and archived-user rejection already exist. | No shared issuance linearization point across session/account invalidation and ASP approved-record/Grant commit established. | Best source for the next session-bound design, not ready for activation. |

Calcu and SpecSpace are local source observations at the stated commits, not
exhaustive audits of every deployment. The isolated Memos checkout has local
prototype changes. The tracked authentication/session/store files cited below
had **no diff from HEAD**; `server/aspdemo` is untracked prototype evidence and
is not an upstream capability or normative implementation. No app files changed
during this inventory.

Memos tracked sources at the inspected commit:

- [Authenticator](https://github.com/usememos/memos/blob/2b2192d4e153bd04f1d325b60fd880cf00d68b01/server/auth/authenticator.go):
  `AuthenticateByAccessTokenV2` validates JWT claims without a session query.
  The surrounding bearer resolution reloads the User, but not the exact
  refresh-session record. `AuthenticateByRefreshToken` checks token existence,
  expiry and current User status and returns the token ID.
- [Session service](https://github.com/usememos/memos/blob/2b2192d4e153bd04f1d325b60fd880cf00d68b01/server/api/v1/auth_service_session.go):
  `SignOut` attempts refresh-token removal and clears cookies; it discards the
  removal error. Rotation adds a new token before removing the old and logs
  removal failure without failing the response. Neither response proves that
  every prior authentication credential is invalidated.
- [User settings store](https://github.com/usememos/memos/blob/2b2192d4e153bd04f1d325b60fd880cf00d68b01/store/user_setting.go):
  refresh-token writes use `refreshTokenMu`; `GetUserRefreshTokenByID` reads
  through `GetUserRefreshTokens`. A process-local write mutex is not evidence
  of atomic auth revalidation plus ASP issuance across all writers/processes.

The local prototype's `server/aspdemo/service.go:301–325,898–914` resolves a
Memos User from bearer authentication and begins demo issuance. That does not
establish the required two exact consent decisions, refresh-session binding,
or private approved-record issuance fence. Do not reuse that route as a
qualified issuer merely because authentication succeeds.

## Proposed narrow host contract

These are obligations to resolve with the host owner, not public SDK types.

1. **Authenticated principal/session.** The trusted control path resolves the
   ordinary User and exact live server-backed session, not a browser-supplied
   User ID. Retain stable host-owned references, applicable deadlines and
   authoritative versions without exporting session credentials. Decide how
   refresh rotation invalidates an approved record; for this initial design,
   old-session removal is material drift requiring fresh consent.
2. **Common invalidation/commit ordering.** Session removal, logout, expiry,
   account archival/deletion and applicable policy changes must participate in
   the same serialization contract as approved-record consumption and complete
   Grant/verifier commit. Checking auth then starting an unrelated transaction
   is insufficient. A newly added ASP-only mutex cannot fence existing writers.
3. **Distinct exact consent.** Bind authenticated local Consent Preview
   confirmation and issuer consent separately to retained material. Ordinary
   login, a create-memo approval, and a task request substitute for neither.
4. **Other authority sources.** Registered Runtime, independent agent identity,
   immutable snapshots/schemas and policy need their own owners and ordering
   guarantees. A Memos account/session fence does not qualify external identity
   or policy. Unavailable/unordered evidence blocks issuance.
5. **Failure and lifecycle.** Expiry is checked at commit; failed or uncertain
   revocation cannot be called confirmed. Postcommit invalidation follows
   current admission/revocation requirements. Durable restart and private
   mediator delivery remain separate mandatory gates, not presumed properties
   of Memos storage.

## Next slice and exit evidence

Next deliverable: a **design-only Memos session/account fence contract**, with
a producer/writer map and sequence diagrams for both invalidation-before-commit
and commit-before-invalidation. Do not start a live adapter implementation.

- Enumerate every relevant session/account/policy writer, its storage boundary,
  cache behavior and process scope; separate principal resolution from session
  validity and consent ownership.
- Choose one supported topology/storage boundary and document how existing
  writers would join its transaction/fence. If participation cannot be secured,
  record the blocker rather than proposing cached validity or polling as proof.
- Specify source-neutral vectors: missing/revoked/expired session, rotated
  session, archived User, unavailable store, failed logout persistence,
  both race orderings, copied principal reference and restart uncertainty.
- Identify the host integration changes and reusable SDK obligations separately;
  no TS API is frozen by this report. Keep the first slice limited to auth and
  ordering design, with identity, consent, durable issuance and delivery visibly
  unresolved.

Exit requires source-backed ownership and a feasible ordering design, not
another passing in-memory model. Implementation needs a separate authorized
slice and all prerequisites in the
[consent-bound issuance plan](consent-approved-request-issuance-slice.md).
Pinned ASP requirements remain those in
[Private Issuance and Exact Consent](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-private-issuance-and-consent).
This document supplies no conformance claim and does not close Stage 1 or ADP gates.
