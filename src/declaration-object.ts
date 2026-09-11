/** Internal JSON boundary reader. Diagnostics never contain caller values. */
export class DeclarationObject {
  readonly #value: unknown;
  readonly #error: string;

  constructor(value: unknown, error: string) {
    this.#value = value;
    this.#error = error;
  }

  fields(
    required: readonly string[],
    optional: readonly string[] = [],
    unsupported = this.#error,
  ): void {
    const value = this.record();
    if (required.some((key) => !Object.hasOwn(value, key))) this.reject();
    if (
      Object.keys(value).some(
        (key) => !required.includes(key) && !optional.includes(key),
      )
    ) {
      throw new Error(unsupported);
    }
  }

  member(name: string): unknown {
    return this.record()[name];
  }

  text(name: string): string {
    const value = this.member(name);
    if (typeof value !== 'string' || value.trim().length === 0) this.reject();
    return value;
  }

  list(name: string): unknown[] {
    const value = this.member(name);
    if (!Array.isArray(value)) this.reject();
    return value;
  }

  record(): Record<string, unknown> {
    if (
      typeof this.#value !== 'object' ||
      this.#value === null ||
      Array.isArray(this.#value)
    )
      this.reject();
    return this.#value as Record<string, unknown>;
  }

  reject(): never {
    throw new Error(this.#error);
  }
}
