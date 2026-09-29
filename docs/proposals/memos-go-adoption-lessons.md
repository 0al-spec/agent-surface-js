# Memos Go adoption probe: SDK boundary lessons

Status: local experimental observation, 2026-09-29. This is design input, not
an implemented SDK contract, ASP conformance evidence, or a new delivery gate.

The experiment used an isolated checkout of upstream Memos v0.31.0 at
`2b2192d4e153bd04f1d325b60fd880cf00d68b01` with an uncommitted,
opt-in Go adapter. The adapter and its test results are not published in this
repository, so they are **not independently reproducible from this document**.
No production Memos installation or existing user note was used. The current
SDK remains TypeScript/Node.js; there is no Go SDK implementation to evaluate.
The [architecture](../architecture.md) and
[ASP adoption backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md)
continue to own component boundaries and delivery status, respectively.

## What the local probe actually showed

| Observation | Limited conclusion |
| --- | --- |
| A single registered `memo.create_private` action reached Memos' existing `CreateMemo` API after local Grant, session, approval, and input checks. | A curated ASP action can wrap existing Go business behavior without exposing a whole application API. The local authority and approval mechanisms were prototype-only. |
| A pinned Codex app-server was offered only `memo_create_private`. In one opt-in test, a request to delete a seeded note made no application tool call and left that note intact. | The offered tool surface did not grant deletion in that run. This does not prove that an arbitrary agent cannot delete through other tools, credentials, or deployment paths. |
| Two already-approved calls raced on one idempotency key; one created a memo, the other was rejected. A process restart retained one memo and blocked a fresh Grant from repeating that key. | The local single-node journal fenced this tested retry path. It is not a distributed exactly-once guarantee. |
| A test-only build paused immediately after successful `CreateMemo` but before journal finalization; the process was killed. After restart, one memo existed and recovery returned `unknown`, not a success receipt or automatic retry. | A durable `pending` record can prevent a duplicate while honestly preserving uncertainty. It cannot by itself make the Memos write and journal update atomic. |

The loopback transport was a development-only HTTP endpoint. The synthetic
identity, unsigned receipts, local terminal confirmation, process-memory Grant
state, and file journal do not satisfy a production ASP profile. Passing these
probes must not advance an RFC card's maturity or the SDK source lock.

## Candidate reusable behavior, not proposed exports

The experiment suggests a narrow separation for a future Go implementation of
the selected ASP contract:

| Candidate SDK behavior | Required host/application input |
| --- | --- |
| Closed wire decoding, schema validation, canonical hashes, and immutable action/Grant/session bindings | Curated action declaration, selected profile and schemas, trusted issuer and verifier configuration |
| Current-state admission, key/tuple checks, quota and revocation mechanics, and receipt construction | Authoritative state adapter and independent application-side policy decision |
| A recovery protocol that distinguishes `pending`/`unknown`, `applied`, and conflicting reuse of a key | Durable store with declared ordering, availability and retention semantics; reconciliation policy for uncertain effects |
| An explicitly bound handler port reached only after admission | Memos' existing `CreateMemo` behavior, owner/visibility rules, side-effect inventory and domain tests |

These are possible responsibilities, **not** a recommendation to copy the
prototype's file journal into an SDK. A generic `get`/`set` storage interface
would hide the decisive property: reservation must be durable before mutation,
and the host must define whether its business transaction can commit with the
operation record. If it cannot, the SDK must expose an uncertain outcome and
allow a retry only when the host supplies either an atomic application-level
deduplication guarantee for the stable operation key or reconciliation that
conclusively establishes that no effect was applied. The adapter must also
recheck that the original authority and approval are still valid before
dispatch. Otherwise the outcome stays uncertain and requires reconciliation;
the SDK must not retry transparently. Silent journal deletion, multiple
replicas with separate directories, and a new idempotency key remain outside
this probe's fence. An SDK cannot make an arbitrary external side effect
transactional.

Memos-specific policy stays with Memos: authenticate the user; decide which
content, effects, and visibility are allowed; bind a real user decision; call
the native API; and reconcile an uncertain write. The prototype had to refuse
configured webhooks and mention syntax, and its preflight was not atomic with
changes to those settings. Those are application effect questions, not fields a
language SDK can infer from a Go method signature. Omitting a delete action is
necessary for this surface, but the host must also withhold independent delete
tools and credentials from the agent.

## Implication for cross-language SDK planning

The Go application is useful as a **portability counterexample** to an
accidentally Node-specific architecture. It is not yet a second SDK consumer:
the Go adapter is handwritten and no common Go library was used. Share the
normative ASP contract and language-neutral positive/negative vectors across
SDKs; let a future Go package use idiomatic interfaces and explicit host
composition rather than TypeScript class shapes or Node transport assumptions.
Do not freeze a Go public API or claim reduced integration cost from one local
prototype. Measure reusable library work and application-specific wiring
separately when an independently reviewable implementation exists.

This note does not request another robustness campaign. The bounded probe has
served its purpose: it identifies the recovery boundary and the application
decisions a future SDK must not conceal.
