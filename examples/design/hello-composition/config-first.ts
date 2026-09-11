// Design-only ASP wiring; only the unconfigured native branch runs today.
import {
  type DeploymentInput,
  deploymentNotConfigured,
  prepareCodexAgentHost,
} from './composition.ts';
import { GreetingApp, type GreetingAssistant } from './greeting-app.ts';

const app = new GreetingApp();

if (process.env.ASP_AGENT_DEMO !== '1') {
  app.runNative();
} else {
  await runAgentSketch(deploymentNotConfigured());
}

async function runAgentSketch(deployment: DeploymentInput): Promise<void> {
  // Fictional future exports; the native path never resolves this import.
  const sdk = await import('@0al/agent-surface/sketch');
  const manifest = (
    await import('./asp-manifest.json', { with: { type: 'json' } })
  ).default;
  const { schemas } = await import('./schema-map.ts');
  const greetings = app.greetingPort();
  const info = app.infoPort();

  // Exact trusted-executor allow-list; no app object crosses this boundary.
  const handlers = new Map<string, () => Promise<object>>([
    ['app.version', async () => ({ version: info.version() })],
    ['greeting.goodbye', async () => ({ message: greetings.goodbye() })],
    ['greeting.propose', async () => ({ message: greetings.greet() })],
  ]);
  const surface = sdk.publishedSurface({ manifest, schemas, handlers });
  const view = sdk.consoleWorkView(process.stdout);

  await using host = await prepareCodexAgentHost(deployment, surface);
  await host.withAgent(surface, async (session) => {
    const assistant: GreetingAssistant = {
      async requestGreeting(): Promise<void> {
        const work = await session.request('greeting.requested', {});
        await view.observe(work);
      },
    };
    await app.runWithAssistant(assistant);
  });
}
