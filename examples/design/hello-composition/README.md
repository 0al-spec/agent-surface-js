# Application-first, bidirectional Hello composition

Status: owner-endorsed design direction, recorded 2026-09-11. Approximately 80%
of the desired ergonomics, **not 80% of an implemented SDK**. These files preserve
the preferred sketch for subsequent architecture work, not a public API promise,
working ASP deployment, conformance result or Calcu migration approval.

The native Hello application works without ASP. Its optional integration uses
ordinary ASP manifest/JSON Schema data, explicit domain ports and a separate
composition root. No decorator framework, additional configuration DSL, global
registry or automatic exposure of public methods is needed.

## Read the example

| File | Responsibility | Executable status |
| --- | --- | --- |
| [greeting-app.ts](greeting-app.ts) | Private native behavior, narrow incoming ports, outgoing `GreetingAssistant` interface | Native behavior tested |
| [config-first.ts](config-first.ts) | Opt-in bootstrap, exact handler allow-list and local assistant facade | Native branch only; agent branch deliberately refuses missing deployment |
| [composition.ts](composition.ts) | Explicit provider, runtime, executor, transport and lifetime ownership | Fictional SDK/provider API; not implemented |
| [asp-manifest.json](asp-manifest.json) | Three actions, one authorized-event declaration and exposure metadata | Offline design fixture, not a deployable manifest |
| [schema-map.ts](schema-map.ts), [schemas](schemas) | Four closed schemas, resolved from local files | Offline fixture data; no URL fetching |

The imports `@0al/agent-surface/sketch` and
`@0al/agent-surface-codex/sketch` do **not** exist. No stubs make them appear
available. Normal SDK type-checking reaches only the native app through its
tests; the other TypeScript files receive formatting/syntax checks, not full
semantic type-checking. The example is excluded from SDK exports, build output
and the npm tarball. Current implemented exports are described in the
[SDK README](../../../README.md).

## Both directions, with different responsibilities

**Application to agent.** `GreetingApp` calls its own `GreetingAssistant`
interface. The bootstrap implements it with a local facade that requests
`greeting.requested` through the bound session and observes safe work updates.
The proposed SDK must arrange a runtime-requested, application-authorized
subscription bound to the exact Grant. The runtime applies user/local policy
before starting work. This is authorized event delivery, not an application
task stuffed into `session.start` or unrestricted access to agent methods.

**Agent to application.** The provider adapter uses only a bounded work port.
Its tool calls reach the runtime mediator, client-only authenticated HTTPS
transport and independent application executor, then an allow-listed handler
and the native port. Results return through that same route. The adapter never
receives `GreetingApp`, its ports, the handler map or authority stores. A public
method is not automatically an ASP action; native methods may remain private.

`assistant` is therefore not the real agent. The explicit future
`CodexAgentAdapter` in `composition.ts` is where the actual provider connection
belongs. The selected executable, `gpt-5.6-luna` and `low` are deployment
configuration, not identity evidence or permission. The host must validate the
approved selection and isolate untrusted code. TypeScript types/private fields
cannot sandbox a malicious dependency in the same privileged process.

## What the concise wiring must preserve

- The application and runtime own independent current authority/policy inputs
  and decisions, even when they reuse SDK code. Credentials stay in opaque
  custody and authenticated transport, never in model/browser payloads.
- `AdmittedAgentWork` must come from trusted runtime admission. It is not an
  agent-supplied struct or an assertion made true by a cast. Before
  `agent.run(access)`, recheck Grant, exact session generation, tuple, guard/fence
  and cancellation. `openAgentWork()` provides a per-work port with correlation
  and deadline, not selectable authority. Every action still requires current,
  independent application admission.
- `await using access` closes/fences local access. Host deadlines and revocation
  must work even if an adapter never returns. No late result may reopen access.
- Constructors are inert. `prepare()` validates selected dependencies, starts
  no agent task, issues no default Grant and cleans up partial initialization
  before returning an owned host. `await using host` alone cannot clean up an
  initialization failure that happened before acquisition.
- `owned` components are disposed by the host; borrowed deployment policy,
  identity and lifecycle stores remain deployment-owned. Cleanup must not
  revoke unrelated Grants or close unrelated sessions/resources.
- Event acknowledgement, admitted work, bounded observation, authenticated
  application results and unverified agent prose are different facts.
  `requestGreeting(): Promise<void>` promises observation completion, not proven
  task success. Local disposal does not prove remote exit, provider cleanup or
  rollback. Unknown outcomes remain explicit.

These are requirements for the eventual implementation, **not tests passed by
this sketch**. The [architecture](../../../docs/architecture.md#optional-bidirectional-application-composition)
and [API guidance](../../../docs/api-design-principles.md) own the design;
the [boundary contract](../../../docs/boundary-contract.md) owns selected-slice
acceptance. Task status stays in the ASP ADP backlog linked there.

## Adding an operation without duplicating the host

The preserved variant includes `app.version` alongside `greeting.propose` and
`greeting.goodbye`. The new behavior needs a private method, narrow info port,
handler binding and schema/manifest update, not another provider/session/host.
The version is the fixed public string `1.0.0`, not arbitrary application data.
The two greetings are also fixed public strings, with empty input/event payloads.

The surface's changed version/hash must be bound by fresh applicable consent
and Grant; adding an action never silently upgrades existing authority.
`proposal_only` here includes one side-effect-free `read` and two non-persisted
`propose` actions. This Hello design does not widen the first Calcu slice's
single `calculation.propose` action or implement `user_managed` handling in the
currently pinned SDK. The source lock remains unchanged.

The manifest has reserved `.invalid` endpoints and unconfigured `auth`/`audit`
placeholders. A matching surface hash or closed schema does not validate the
complete manifest, establish publisher authenticity or make this deployable.
There is no Grant, credential, identity artifact, private key or live connection.

## Verification and remaining work

From the SDK root:

```sh
npm run check
npm run build
npm pack --dry-run
```

[Tests](../../../tests/hello-composition.test.ts) cover native output, exact
frozen ports, awaited outgoing calls/error propagation, the fixture surface hash
and local schema references. They do not execute the proposed ASP composition,
prove admission or validate the full protocol. CI remains on its existing Node
matrix; it does not run the fictional agent path.

For a local native-only demonstration with Node 26.5 (the sketch uses
`await using` and TypeScript stripping):

```sh
ASP_AGENT_DEMO=0 node examples/design/hello-composition/config-first.ts
```

Output: `Hello, world!` and `Goodbye, world!`. Opting in currently throws
`deployment_not_configured` before resolving nonexistent SDK imports. Do not
replace that guard with permissive test authority to imply a working demo.

Still open: exact types/signatures and package layout; qualified provider and
transport adapters; transactional authority/lifecycle semantics; implemented
negative boundary tests and actual consumer cost. The endorsement chooses the
shape, not those unimplemented answers or additional normative obligations.
