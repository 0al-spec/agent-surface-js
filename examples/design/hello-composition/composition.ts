// Design-only: these SDK/provider exports do not exist. See README.md.
import type * as Asp from '@0al/agent-surface/sketch';

/** Borrowed deployment-owned dependencies; host disposal never closes them. */
export interface DeploymentInput {
  readonly application: {
    readonly authority: Asp.ApplicationAuthority;
    readonly policy: Asp.ApplicationPolicy;
    readonly identity: Asp.ApplicationIdentityVerifier;
    readonly lifecycle: Asp.ApplicationLifecycleStore;
    readonly httpsServer: Asp.AuthenticatedHttpsServerConfig;
  };
  readonly runtime: {
    readonly agent: {
      readonly executable: string; // Trusted absolute path, checked against startup policy.
      readonly model: 'gpt-5.6-luna';
      readonly reasoningEffort: 'low';
    };
    // Opaque credential custody/authentication; never a raw credential getter.
    readonly authority: Asp.RuntimeAuthority;
    readonly policy: Asp.RuntimePolicy;
    readonly identity: Asp.RuntimeIdentityVerifier;
    readonly lifecycle: Asp.RuntimeLifecycleStore;
    readonly httpsClient: Asp.AuthenticatedHttpsClientConfig;
  };
}

export function deploymentNotConfigured(): never {
  throw new Error('deployment_not_configured');
}

export async function prepareCodexAgentHost(
  deployment: DeploymentInput,
  surface: Asp.PublishedSurface,
): Promise<Asp.PreparedAgentHost> {
  const [sdk, provider] = await Promise.all([
    import('@0al/agent-surface/sketch'),
    import('@0al/agent-surface-codex/sketch'),
  ]);

  // Fictional constructors only capture values; prepare() owns validation and I/O.
  const executor = new sdk.ActionExecutor({
    surface,
    authority: deployment.application.authority,
    policy: deployment.application.policy,
    identity: deployment.application.identity,
    lifecycle: deployment.application.lifecycle,
  });
  const channel = new sdk.AuthenticatedHttpsChannel({
    client: deployment.runtime.httpsClient,
    server: deployment.application.httpsServer,
    executor,
  });
  const mediator = new sdk.RuntimeMediator({
    authority: deployment.runtime.authority,
    policy: deployment.runtime.policy,
    identity: deployment.runtime.identity,
    lifecycle: deployment.runtime.lifecycle,
    transport: channel.client(),
  });
  const agent = new provider.CodexAgentAdapter(deployment.runtime.agent);
  const host = new sdk.AgentHost({
    owned: { agent, mediator, channel, executor },
    async runAgentWork(admittedWork: Asp.AdmittedAgentWork) {
      // Produced only by trusted admission; a cast/adapter input cannot mint it.
      // Recheck current bindings/fence here; each action still needs app admission.
      await using access = await mediator.openAgentWork(admittedWork);
      await agent.run(access);
    },
  });
  return host.prepare({ surface });
}
