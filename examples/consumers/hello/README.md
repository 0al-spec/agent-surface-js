# Second consumer: Hello

This is a separate, small application consuming the packed
`@0al/agent-surface` package through its public root export. The native
`greet()` function works without ASP; `asp-values.mjs` is an opt-in illustration
of current offline manifest, schema, semantic-request and selected-Grant
validation.

The agent identity evidence and Grant are inert format fixtures. This example
does **not** verify an agent, authenticate a user, establish consent, issue a
credential, create a session, admit an action, execute a handler, contact its
reserved `.invalid` URLs, or prove ASP conformance. It demonstrates package
reuse for value representations only, not reusable issuer/executor/runtime
behavior.

From the SDK repository root:

```sh
npm run test:hello-consumer
```

The check builds and packs the SDK, installs that tarball into an isolated
temporary consumer directory with install scripts disabled, then runs the
consumer tests and native app. It does not change the user's npm configuration.
The sample imports only the package root; it never reaches into SDK `src/` or
test helpers. The consumer's hand-authored ASP manifest and schemas remain
application-specific declarations, while SDK classes validate their bounded
representation. The example itself is not included in the published package.
