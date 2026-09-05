import { type Node, type ParseError, parseTree } from 'jsonc-parser';

/** Immutable source text. Parsing and validation occur only when requested. */
export class JsonDocument {
  readonly #text: string;

  constructor(text: string) {
    this.#text = text;
  }

  /** A fresh boundary value on every call; duplicate keys have not been erased. */
  parse(): unknown {
    const errors: ParseError[] = [];
    const root = parseTree(this.#text, errors, {
      disallowComments: true,
      allowTrailingComma: false,
    });
    if (!root || errors.length) throw new Error('invalid_json');
    this.#validate(root);
    return JSON.parse(this.#text);
  }

  #validate(node: Node): void {
    if (
      node.type === 'number' &&
      (!Number.isFinite(node.value) || Object.is(node.value, -0))
    ) {
      throw new Error('invalid_json_number');
    }
    if (node.type === 'string' && !node.value.isWellFormed()) {
      throw new Error('invalid_unicode');
    }
    if (node.type === 'object') {
      const keys = new Set<string>();
      for (const property of node.children ?? []) {
        const key = property.children?.[0]?.value;
        if (keys.has(key)) throw new Error('duplicate_json_member');
        keys.add(key);
      }
    }
    for (const child of node.children ?? []) this.#validate(child);
  }
}
