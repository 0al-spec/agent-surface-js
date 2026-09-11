export interface GreetingPort {
  greet(): string;
  goodbye(): string;
}

export interface AppInfoPort {
  version(): string;
}

export interface GreetingAssistant {
  // Resolves after bounded observation, not after verified task completion or effects.
  requestGreeting(): Promise<void>;
}

export class GreetingApp {
  #greet(): string {
    return 'Hello, world!';
  }

  #goodbye(): string {
    return 'Goodbye, world!';
  }

  #version(): string {
    return '1.0.0';
  }

  greetingPort(): Readonly<GreetingPort> {
    return Object.freeze({
      greet: () => this.#greet(),
      goodbye: () => this.#goodbye(),
    });
  }

  infoPort(): Readonly<AppInfoPort> {
    return Object.freeze({ version: () => this.#version() });
  }

  runNative(write: (line: string) => void = console.log): void {
    write(this.#greet());
    write(this.#goodbye());
  }

  async runWithAssistant(assistant: GreetingAssistant): Promise<void> {
    await assistant.requestGreeting();
  }
}
