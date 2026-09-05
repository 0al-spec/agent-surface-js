# Elegant Objects engineering policy

Adapted for new SDK development and refactoring from
[PromptEval's Elegant Objects refactoring guidelines](https://github.com/SoundBlaster/PromptEval/blob/main/tools/prompt-eval/prompts/elegant_objects/eo_refactor.md).

Preserve observable behavior first. Refactor in small, reviewable steps. Existing
tests are characterization tests unless a task explicitly changes behavior.
When tests are missing, add the smallest meaningful behavior tests first.

Before choosing classes, identify domain invariants and state transitions.
Model aggregate behavior explicitly and check constraints against the relevant
whole state, rather than one raw input item at a time.

For state changes, separate decision from mutation: validate guards against the
current aggregate, then produce the next state after admission. Keep caller
payloads immutable and update aggregate state after each accepted batch item.

- Move behavior into focused objects rather than procedural helpers, controllers,
  dictionaries, or raw primitives.
- Prefer immutable values and explicit dependencies.
- Ask objects for behavior instead of introducing domain getters/setters.
- Avoid Utils, Helpers, Managers, Processors, and broad Services.
- Constructors assign dependencies and values only. I/O, parsing, caching, and
  heavy validation belong in explicit behavior or collaborators.
- Prefer composition and decorators over inheritance trees, flags, casts, and
  type-branching ladders. JSON type inspection belongs at the input boundary.
- Convert boundary DTOs into behavior-rich objects before domain behavior.

Keep refactoring narrow. Public API changes require task scope that allows them.
Leave unrelated modules alone. Do not chase EO purity beyond the requested change.
Do not rename external protocol fields, generated code, fixture names, or
serialization keys.

Prefer a small runnable object model over a larger rewrite. Run relevant checks
and review for behavior changes, over-refactoring, DTO leakage, static-helper
relapse, mutable setters, and naming dogmatism. Report larger opportunities
separately instead of applying them.
