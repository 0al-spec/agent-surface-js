# Offline proposal receipt-channel qualification

Design qualification, 2026-10-03 UTC. This records the host/channel boundary
needed to consume complete proposal receipts and compares it with Calcu's
current local HTTPS demo. It does not define a new ASP transport binding or
qualify a production deployment.

## Decision

For the Calcu demo, the existing pinned loopback HTTPS connection authenticates
delivery of the **custom action response bytes** to the mediator. Calcu currently
places its complete App Receipt in a private `action.result` response member;
that member is not a declared ASP inline receipt extension, and the manifest
does not select `agent_api.receipt_url`. Therefore this is evidence about the
local HTTPS peer and response, not yet an ASP-qualified receipt channel. The
local host configures the endpoint, trusts the ephemeral development
certificate, verifies the `127.0.0.1` identity, and receives the response
through that connection. The endpoint-to-`app_id` and surface mapping must come
from the locally selected immutable snapshot, never from receipt fields.

This is a **host-owned live-channel decision**, not a portable receipt
authentication profile. TLS authenticates the configured server peer to this
client for this connection. It does not make copied receipt JSON independently
verifiable, prove that the application accepted the business result, or show
that the current Grant remains active or establish independently that the
business outcome is correct. The offline checker therefore keeps
`producer_authentication`, `current_authority`, `trusted_time` and
`application_acceptance` at `not_verified`. Any live channel verdict belongs to
the host adapter and expires with that exchange.

Do not add a generic SDK receipt-fetch URL implementation yet. The pinned RFC
permits complete receipt delivery via `agent_api.receipt_url` or an explicitly
declared inline action-request extension, but the selected SDK contract does
not define an HTTP method, route template, query grammar, response schema or
server-authentication profile for the URL. The selected request/result work
also deliberately does not invent these details. Keep network access, trust
roots and the mapping from configured endpoint to application identity in a
host adapter. Do not fetch an endpoint copied from a receipt or response.

## What channel authentication establishes

In this selected Calcu path:

1. The mediator creates and retains the Runtime Receipt locally, then sends the
   action over the configured HTTPS connection. Calcu validates the complete
   supplied Runtime Receipt and its hash before invoking the handler.
2. Calcu creates the App Receipt after successful evaluation and returns it in
   the response body. The mediator accepts bytes only from its already
   configured HTTPS request after TLS validation and exact response checks.
3. The mediator compares the complete receipt pair against request/result
   expectations retained before the response, including the configured app and
   surface binding. A response-supplied identity never chooses those values.

The transport protects response bytes in transit and identifies the TLS peer
under the host's configured trust policy. This supports the statement “the
configured Calcu endpoint delivered these bytes over this authenticated
connection.” It does not support “these receipts remain authentic after export”
or “an independent party can verify who produced them.” Those stronger claims
need an applicable signed-receipt profile, key/trust distribution and separate
verification. Re-hashing unsigned receipt content cannot provide that property.

The authenticated client credential in the Authorization header is a separate
direction of the exchange: it authenticates the caller to the application under
the selected Compatibility Bearer demo profile. It does not authenticate the
application to the mediator. Server TLS validation supplies that peer-auth
direction; neither direction establishes user consent or substitutes for
current Grant/session admission.

## Calcu comparison

Source reviewed: Calcu local branch `codex/p5-t10b-greeting-exchange` at
`a800a8f973bcbdb799a2eabbee99463e2d26459b`, covering `server/transport.ts`,
`server/localBackend.ts`, `server/executor.ts`, `server/demoHost.ts`,
`server/developmentTls.ts`, `server/manifest.ts`, `server/receipts.ts` and
`server/README.md`. This is a source inspection, not a new Calcu integration
run.

| Property | Calcu implementation observed | Qualification |
| --- | --- | --- |
| Server peer | `createDevelopmentTlsMaterial` generates ephemeral local TLS material; `createAuthenticatedHttpsTransport` requires `https://127.0.0.1/...`, receives its certificate as CA, sets `rejectUnauthorized: true`, and makes a direct Node HTTPS request. | Authenticates the local server key holder to this mediator for the demo exchange. Because the same trusted host provisions both sides, this is not independent application-vendor authentication and does not qualify a remote deployment. |
| Request target | Exact `/agent-actions`; method `POST`; no username/password/query/fragment; fixed loopback hostname. The transport does not follow redirects. | A narrow app-specific action binding; not an ASP receipt URL binding. |
| Runtime evidence | LocalBackend retains its Runtime Receipt and sends the complete value in the documented Calcu-only `runtime_receipt` request member. | It can be checked by the server during this request. This field is not being promoted as a generic ASP member. |
| App evidence | The executor creates an App Receipt in a private `action.result` member; LocalBackend checks the complete tuple and output hash before returning a result. | Response bytes arrive from the authenticated local peer, but the member is an undeclared Calcu-specific inline extension. It is transient in-memory evidence, not a portable proof or qualified ASP receipt delivery choice. |
| Browser/model exposure | Receipts and hashes remain in server-side code. | Preserves the existing server boundary. |
| Manifest receipt discovery | The current Calcu snapshot does not declare `agent_api.receipt_url`; it also carries the complete app receipt inline without a declared inline receipt extension. | Neither the request's `runtime_receipt` member nor response's `receipt` member establishes interoperable ASP delivery. A future live adapter needs a declared, RFC-conformant delivery choice and qualified details. |
| Input hash declaration | The inspected selected declaration does not yet meet the receipt-chain `input_hash_profile` requirement. | Resolve the declaration and calculate the profile-defined hash over exact validated wire input before claiming the selected receipt contract. |
| Policy reason | `server/receipts.ts` currently emits `local_forwarding_policy_allowed` and `proposal_action_within_active_grant`. | These are bare custom codes. The selected RFC reason is `policy_allowed`; custom extensions need a collision-resistant URI and applicable declaration. |

For the current two allow decisions, the smallest compatibility mapping is
`policy_allowed` for both runtime and application policy decisions. This says
each producer's own policy allowed its step; it does not merge the decisions or
make runtime approval sufficient for application admission. The reason value
is covered by the policy-decision hash, and that policy hash is covered by the
receipt hash, so Calcu must create fresh matching hashes after changing it.
No prior receipt should be edited in place. Calcu's demo receipts are transient,
but any future retained evidence needs an explicit version/migration policy.

## Host adapter contract before live SDK use

The host adapter must own and retain all of the following before sending the
action:

- The exact selected manifest/surface snapshot, `app_id`, surface version/hash,
  logical audience, action and input hash profile.
- The exact HTTPS endpoint and TLS trust configuration mapped to that
  application/surface. Trust configuration must not be supplied by the agent,
  response, receipt or action input.
- The current Grant/session binding and saved request expectations. The
  response cannot replace or extend this authority.
- The request's finalized Runtime Receipt and expected correlation values.

For each exchange, the adapter must:

1. Require HTTPS, exact configured origin/path/method, valid server certificate
   and expected server identity; reject redirects, unexpected proxy behavior,
   wrong Host, content type, status, size or truncated bodies.
2. Enforce request/response limits, deadline, cancellation and `no-store`; do
   not log credentials, complete receipts or sensitive input.
3. Treat all response values as untrusted until strict decoding, receipt-pair
   integrity checks and independent tuple/result checks pass. App identity and
   surface expectations come from retained host configuration.
4. Keep the channel-authenticated observation attached to the exact response
   bytes and connection lifecycle. A caller-provided `authenticated: true`,
   `producer_verified: true` or deserialized flag is not evidence.
5. Fail closed on missing/ambiguous receipt delivery. Do not fall back from a
   required complete receipt to a hash, URL discovered from untrusted content,
   bare response or unchecked inline extension.
6. Keep application acceptance as a separate host/application decision. Receipt
   integrity and authenticated delivery alone do not establish current authority
   or business correctness.

If evidence must be exported, replayed offline, delivered across an untrusted
intermediary or verified by a third party, this live channel is insufficient.
Use a separately selected signed-receipt profile and verify the exact signer,
key status, signature bytes, receipt role and policy under an independently
configured trust store. Do not silently upgrade the assurance reported by the
offline unsigned checker.

## Readiness and next implementation slice

The generic receipt-pair checker from the preceding PR is ready to validate
complete unsigned receipt content against independent host expectations. This
does not provide a receipt transport or authenticate its source.

Before wiring it into a live Calcu path, resolve these concrete gaps:

1. Select a receipt-delivery choice permitted by the pinned RFC and, if using
   `receipt_url`, specify its actual route/method/schema and server-authentication
   configuration without inventing universal wire semantics in the SDK.
2. Declare and implement `input_hash_profile` consistently with the pinned
   Actions contract.
3. Map Calcu's two local allow reasons to `policy_allowed` (or formally qualify
   a collision-resistant URI extension), then recompute policy and receipt
   hashes.
4. Feed the exact response bytes from the host-authenticated transport into the
   integrity checker while preserving independent app/surface/Grant expectations.
5. Keep `integrity_checked` distinct from the live host's peer-authenticated
   delivery observation and the application's final acceptance decision.

No Calcu source, ASP normative text, SDK public export or source lock changed in
this qualification. It is a design gate for those separately scoped changes,
not a conformance result.

## Normative and implementation references

- [ASP Evidence: receipt delivery and hash-chain limits](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/evidence.md#receipt-hash-chain)
- [ASP Core: Action Request receipt delivery](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/core.md#action-request)
- [ASP Core: Actions and `input_hash_profile`](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/core.md#actions)
- Calcu local source snapshot `a800a8f973bcbdb799a2eabbee99463e2d26459b` on `codex/p5-t10b-greeting-exchange`: `server/transport.ts`, `server/receipts.ts`, `server/localBackend.ts`, `server/manifest.ts`.
