import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GreetingApp } from '../examples/design/hello-composition/greeting-app.js';
import { JsonDocument, SurfaceSnapshot } from '../src/index.js';

const example = new URL(
  '../examples/design/hello-composition/',
  import.meta.url,
);

describe('native Hello behavior, not ASP admission', () => {
  it('emits the same two lines without an SDK or agent', () => {
    const lines: string[] = [];
    new GreetingApp().runNative((line) => lines.push(line));
    expect(lines).toEqual(['Hello, world!', 'Goodbye, world!']);
  });

  it('exposes an exact frozen greeting port with detached closures', () => {
    const app = new GreetingApp();
    const port = app.greetingPort();
    const { greet, goodbye } = port;
    expect(Object.keys(port).sort()).toEqual(['goodbye', 'greet']);
    expect(Object.isFrozen(port)).toBe(true);
    expect(greet()).toBe('Hello, world!');
    expect(goodbye()).toBe('Goodbye, world!');
    expect('greet' in app).toBe(false);
    expect('goodbye' in app).toBe(false);
  });

  it('exposes only a fixed version through a separate frozen info port', () => {
    const app = new GreetingApp();
    const port = app.infoPort();
    const { version } = port;
    expect(Object.keys(port)).toEqual(['version']);
    expect(Object.isFrozen(port)).toBe(true);
    expect(version()).toBe('1.0.0');
    expect('version' in app).toBe(false);
    expect(Object.keys(app.greetingPort()).sort()).toEqual([
      'goodbye',
      'greet',
    ]);
  });

  it('calls its outgoing interface once and awaits observation', async () => {
    let release = () => {};
    let calls = 0;
    let settled = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = new GreetingApp().runWithAssistant({
      async requestGreeting() {
        calls += 1;
        await gate;
      },
    });
    void running.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(calls).toBe(1);
    expect(settled).toBe(false);
    release();
    await running;
    expect(settled).toBe(true);
  });

  it('preserves an outgoing failure', async () => {
    const failure = new Error('observation failed');
    await expect(
      new GreetingApp().runWithAssistant({
        async requestGreeting() {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
  });
});

describe('offline Hello artifact integrity, not full manifest validation', () => {
  it('preserves the supplied surface hash with the implemented hashing layer', () => {
    const text = readFileSync(new URL('asp-manifest.json', example), 'utf8');
    expect(new SurfaceSnapshot(new JsonDocument(text)).hash()).toBe(
      'sha-256:N-Wq3vC9_zchmpsXS4eLND16lNzRyIitlehKMMHXK0I',
    );
  });

  it('keeps the four fixture schemas closed with exact local identities', () => {
    for (const name of [
      'empty-object',
      'hello-result',
      'goodbye-result',
      'version-result',
    ]) {
      const text = readFileSync(
        new URL(`schemas/${name}.schema.json`, example),
        'utf8',
      );
      expect(new JsonDocument(text).parse()).toMatchObject({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: `https://hello.invalid/schemas/${name}.schema.json`,
        type: 'object',
        additionalProperties: false,
      });
    }
  });

  it('references those offline schemas for exactly the preserved actions/event', () => {
    const text = readFileSync(new URL('asp-manifest.json', example), 'utf8');
    const empty = 'https://hello.invalid/schemas/empty-object.schema.json';
    expect(new JsonDocument(text).parse()).toMatchObject({
      actions: [
        {
          id: 'app.version',
          input_schema: empty,
          output_schema:
            'https://hello.invalid/schemas/version-result.schema.json',
        },
        {
          id: 'greeting.goodbye',
          input_schema: empty,
          output_schema:
            'https://hello.invalid/schemas/goodbye-result.schema.json',
        },
        {
          id: 'greeting.propose',
          input_schema: empty,
          output_schema:
            'https://hello.invalid/schemas/hello-result.schema.json',
        },
      ],
      events: [{ id: 'greeting.requested', schema: empty }],
    });
  });
});
