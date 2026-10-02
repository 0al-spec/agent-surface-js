# Offline proposal exchange qualification

Experimental qualification, 2026-10-02 UTC. Sources:
[selected contract](../plans/proposal-exchange-wire-contract.md), pinned
[spec-lock.json](../../spec-lock.json), and
[private implementation](../../experiments/offline-proposal-exchange/README.md).

## Result and scope

The first executable slice covers request/result representation, saved-request
correlation and schema-before-hash ordering. It returns only `evidence_required`.
Full receipt acceptance is the next slice; the table below does not mark those
prerequisites as implemented simply because no verified-success API exists.

Calcu and Greeting exercise the same installed package with different schemas
and synthetic request/result values. Neither is a live application run or an
independent interoperable implementation. The production Calcu adapter, base SDK
exports, declaration grammar, transports and normative repository are unchanged.

| Contract requirement | Executable observation | Remaining boundary |
| --- | --- | --- |
| Closed request/result fields and controls | Each required field removed/null; unknown authority/receipt/URL/extension fields rejected | Full selected manifest and action qualification |
| Strict bounded original JSON | Duplicate keys, malformed JSON/Unicode, negative zero, non-finite numbers and excess nesting rejected | Authenticated streaming transport and its bounds |
| Explicit byte limits | Invalid limits rejected; UTF-8 and serialized outbound growth checked | Separate complete-receipt caps in the receipt stage |
| Canonical digests | Prefix, alphabet, length and decode/re-encode checked, including noncanonical padding bits | Receipt/policy integrity and producer authentication |
| Input/execution hashes | Recomputed with existing ASP domains; independently hand-ordered ASCII JCS golden bytes | Trusted action/schema selection and input normalization |
| Saved-request correlation | Session/generation/Grant/surface/action/key/trace/execution mismatches rejected | Independent current authority and execution-ID lifecycle |
| Producer span | Distinct valid app span accepted; borrowed runtime span/restart trace rejected | Match app receipt span and transport trace context |
| Output schema before hashing | Invalid output rejected before any output hash call | App-specific correctness and disclosure checks |
| Exact JSON values | Reordered objects accepted; arrays, Unicode, whitespace, missing and null remain distinct | No natural-language semantic verifier implied |
| Ownership and re-entry | Returned parsed objects cannot alter retained values; schema callback re-entry leaves expectations intact | Trusted in-process dependencies are not sandboxed |
| Receipt missing/foreign/incorrect | All outputs stay `evidence_required`; valid foreign references are retained as unverified | Complete receipt role/producer/tuple/parent/policy/input/output negative vectors are **not implemented** |
| No boolean trust shortcut | No verified-success or dispatcher method; body verified flags reject | A future receipt stage must consume actual bounded evidence |
| Two consumers and package separation | Packed Calcu/Greeting imports and TypeScript checks; private subpaths/root SDK export blocked; Vite browser entry rejected | Live receipt channel and consumer migration |

## Validation

`npm run test:proposal-exchange` runs the vectors against installed tarballs,
checks the isolated consumer's types and exercises the browser import boundary.
It is included in `npm run check`, which the existing CI runs on Node 22 and 24.
Local validation was performed on Node 26.5.0; CI results must establish those
matrix versions separately.

Local gates passed: `npm run check` (600 existing tests, 335 new vectors and
packed consumer checks), `npm run build`, `npm pack --dry-run` (42 base SDK
files) and `git diff --check`. The built package smoke check also passed.
This report records representation evidence, not certification or live execution
evidence.

## Next slice

Specify the bounded offline receipt-integrity value against independent full
host expectations and actual complete runtime/app receipt JSON. Test receipt
hash/policy views, role, full tuple and parent/input/execution/output/span/result
bindings; keep producer authentication and live transport as explicit host
obligations. Do not add a boolean verification callback or let receipt references
alone promote `PendingProposalEvidence` into successful execution.
