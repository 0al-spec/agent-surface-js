# API design principles

Status: design guidance, 2026-09-11. The sketches below are not implemented,
compilable examples, exported symbols or approved public API signatures.

**Describe the operation once. Compose infrastructure. Grant authority explicitly.**

Use Apple Foundation Models as an ergonomics reference, not as ASP's security
model or a new SDK dependency. The SDK remains provider-neutral: model sessions,
prompting and agent planning belong to agent adapters, not the ASP core.
The [architecture](architecture.md) owns component boundaries; the
[boundary contract](boundary-contract.md) owns selected contract acceptance;
the [ADP backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md)
alone owns task status and delivery sequencing. These principles add no new gate
or task tracker and do not advance the current executable source lock.

## Borrow the ergonomics, preserve the boundary

| Foundation Models reference | ASP design direction | Limit |
| --- | --- | --- |
| `@Generable` and guided generation | Derive supported input/output schema, types and validation from one authoring model | Shape is not truth, authorization or proof of intent |
| `Tool` | A small typed operation object with explicit metadata and a domain handler | Registering a tool grants no authority |
| Profiles and modifiers | Compose supported features with checked dependencies | Configuration changes cannot silently expand a Grant |
| Framework-managed sessions | Reuse lifecycle mechanics through explicit host dependencies | ASP sessions are authoritative state, not model conversation history |

Apple's `Generable` describes guided generation, not merely `Codable` decoding;
the mechanism constrains output structure, not business correctness. Its `Tool`
protocol can be implemented by a struct, and session construction can receive a
tool list. Dynamic Profiles support changes to models, tools and instructions.
These are references for API design, not portable security guarantees or an ASP
binding. Upstream API availability is version-specific:

- [Guided generation](https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation)
- [Tool calling](https://developer.apple.com/documentation/foundationmodels/expanding-generation-with-tool-calling)
- [Dynamic sessions and profiles](https://developer.apple.com/documentation/foundationmodels/composing-dynamic-sessions-with-instructions-and-profiles)

## Two authoring levels

### Application operation

The everyday integration describes a stable action ID, supported wire metadata,
closed arguments/results and a handler connected to existing application logic.
Do not make every handler reimplement hashes, identity checks, Grant validation,
revocation or quota accounting. Domain rules still belong to the application.

Conceptual TypeScript sketch only; all named types below are placeholders:

```ts
const proposal = new ActionDefinition({
  id: 'calculation.propose',
  execution: { mode: 'propose' },
  side_effect: false,
  input: new CalculationInput(),
  output: new CalculationOutput(),
  handler: new ProposeCalculation(calcu),
});
```

`CalculationInput` here means one closed model for `operator`, `left` and
`right`: only add/subtract/multiply/divide and supported finite numbers.
`CalculationOutput` represents the exact operation/result, not agent prose.
Descriptors reference the supported schemas; preserve actual ASP field names
when generating wire objects. The sketch is not itself a complete manifest or
a replacement for wire validation. No `sqrt` or expression parser is implied.

Constructors capture dependencies/values only. Explicit preparation behavior
validates declarations; the executor validates every untrusted invocation.
An annotation cannot prove that a handler is side-effect-free. App tests and
the selected contract must establish that advertised behavior independently.

### Trusted host composition

Provision trust, policy and infrastructure separately from each operation.
The following is a composition sketch, not a callable SDK API:

```text
Trusted host
  surface: proposal_only; calculation.propose; credential release denied
  operation: the proposal definition above
  issuer: trusted principal/consent policy + verified identity evidence
  executor: independent admission using current Grant/session/guard state
  authority store: selected transactional lifecycle/fencing adapter
  transport: selected authenticated server/client adapters
  runtime mediator: provisioned authority + typed request/result validation

prepare -> validate selected contracts and mandatory dependencies
start   -> serve the selected transport; no default Grant is issued
```

This is target composition, not a claim that all roles exist today. Store, keys,
policy and principal ownership remain with the application/deployment. Issuance
uses a separate trusted control path. Neither model arguments nor a browser UI
choose credentials, authority bindings, execution mode or additional actions.
An agent adapter calls only the mediator; the application handler is reached
only through executor admission on the ASP path, not exported as a tool bypass.
Native application routes must preserve the same business invariants.

Missing selected dependencies fail at preparation where knowable; dynamic
identity/status/revocation checks still run at execution. Shared SDK code does
not replace independent runtime and application inputs and decisions. Host
configuration is not a sandbox: isolate untrusted code outside the privileged
process. UI hooks expose safe projections/cancellation, never server authority.

### Preferred application-first example

The owner-endorsed
[Hello composition](../examples/design/hello-composition/README.md) preserves
the preferred config-first shape: native application, explicit incoming domain
ports, an application-owned outgoing assistant interface, existing ASP
manifest/JSON Schemas and one trusted composition root. ASP is an optional
integration, not the organizing framework of the native application.

`assistant` is a local facade connected to authorized event delivery, not a
hidden LLM or a reference to the agent's public methods. The composition root
makes the provider adapter visible and gives it a bounded mediator port, not
application objects. The [architecture](architecture.md#optional-bidirectional-application-composition)
records the authority and resource-ownership rules behind the concise wiring.

Adding the example's fixed `app.version` read operation extends a narrow port,
handler binding and declaration/schema. It does not duplicate agent, transport
or lifecycle setup. The changed surface still needs the required snapshot/hash
and fresh authority; less boilerplate does not mean automatic Grant expansion.
This illustrates a design direction, not a measured general integration cost.

Only the native app and fixture integrity checks run today. Do not add fake SDK
declarations or exports to make the remaining sketch appear implemented. Exact
signatures and deployment/provider qualification await the bounded SDK slices.

## Composition is not mutable authority

Adding a tool or changing a model profile does not extend an ASP Grant. Check a
new configuration against the selected contract, identity, surface, disclosure
and current authority. Where the contract requires it, changed bindings need a
new snapshot/version/hash, fresh consent and Grant, and the specified session
transition; a profile modifier cannot perform an implicit authority upgrade.
Not every model-internal change requires a Grant change: only changes relevant
to the selected contract do. ASP does not regulate internal agent planning.

## How to qualify an ergonomic wrapper

- Use one supported authoring model; test generated schemas/descriptors for
  consistency. Do not silently export all application methods or infer trust,
  data classification or authority from names, types or descriptions.
- Prefer TypeScript inference/builders with runtime validation, not decorative
  casts. Rust macros, Swift wrappers and Go generation can be idiomatic without
  copying TS syntax. Follow the [EO policy](engineering/elegant-objects.md).
- Keep constructor work inert and dependencies explicit; use composition and
  focused behavior instead of inheritance-heavy mixins or service locators.
- Test the expanded execution path, not just a generated descriptor: invalid
  arguments, wrong/stale/revoked authority and missing dependencies fail closed;
  admission rejection makes zero handler calls. Post-execution response
  rejection cannot establish that nothing executed.
- Test import boundaries: privileged host code and credentials stay out of
  browser/model-facing artifacts. Package splitting alone is not isolation.
- Demonstrate Calcu's narrow operation plus separate host setup; measure
  per-operation duplication, setup steps and manual policy decisions separately
  from reusable SDK engineering. No arbitrary line-count target weakens checks.
- Keep a correlated, authenticated application result separate from an agent's
  interpretation. `multiply(111, 2) = 222` does not establish that a user's
  request for `sqrt(111) * 2` was fulfilled.

These are acceptance directions for future implemented wrappers, not passing
test claims. First qualify the pinned manifest/Grant contract and its vectors;
then validate a small consumer-facing API against those invariants. Do not
freeze these illustrative names or add exports merely to make the sketch compile.
