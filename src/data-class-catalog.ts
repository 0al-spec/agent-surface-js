import { DeclarationObject } from './declaration-object.js';
import type { JsonDocument } from './json-document.js';

/** Offline declarations only: labels and classification are publisher assertions. */
export class DataClassCatalog {
  readonly #document: JsonDocument;

  constructor(document: JsonDocument) {
    this.#document = document;
  }

  validate(): void {
    this.#identifiers();
  }

  validateClasses(document: JsonDocument): void {
    const known = new Set(this.#identifiers());
    const classes = document.parse();
    if (!Array.isArray(classes)) throw new Error('invalid_data_exposure');
    this.#ordered(classes, 'invalid_data_exposure');
    if (classes.some((id) => !known.has(id)))
      throw new Error('invalid_data_exposure');
  }

  #identifiers(): string[] {
    const declarations = this.#document.parse();
    if (!Array.isArray(declarations)) throw new Error('invalid_data_classes');
    const ids = declarations.map((value) => {
      const entry = new DeclarationObject(value, 'invalid_data_classes');
      entry.fields(
        ['id', 'classification', 'label', 'description'],
        [],
        'unsupported_data_classes',
      );
      entry.text('label');
      entry.text('description');
      if (
        !['public', 'private', 'sensitive', 'credential'].includes(
          entry.text('classification'),
        )
      )
        entry.reject();
      return entry.text('id');
    });
    this.#ordered(ids, 'invalid_data_classes');
    return ids;
  }

  #ordered(values: unknown[], error: string): void {
    let previous: string | undefined;
    for (const value of values) {
      if (typeof value !== 'string' || value.trim().length === 0)
        throw new Error(error);
      if (previous !== undefined && !this.#before(previous, value))
        throw new Error(error);
      previous = value;
    }
  }

  #before(left: string, right: string): boolean {
    // JS string ordering uses UTF-16; ASP requires Unicode code point ordering.
    const a = Array.from(left, (char) => char.codePointAt(0) ?? 0);
    const b = Array.from(right, (char) => char.codePointAt(0) ?? 0);
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      if (a[index] !== b[index]) return (a[index] ?? 0) < (b[index] ?? 0);
    }
    return a.length < b.length;
  }
}
