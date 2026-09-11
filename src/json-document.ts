import {
  createScanner,
  type Node,
  type ParseError,
  parseTree,
} from 'jsonc-parser';

/** Immutable source text. Parsing and validation occur only when requested. */
export class JsonDocument {
  readonly #text: string;

  constructor(text: string) {
    this.#text = text;
  }

  /** A fresh boundary value on every call; duplicate keys have not been erased. */
  parse(): unknown {
    this.#checkNesting();
    const errors: ParseError[] = [];
    const root = parseTree(this.#text, errors, {
      disallowComments: true,
      allowTrailingComma: false,
    });
    if (!root || errors.length) throw new Error('invalid_json');
    this.#validate(root);
    return JSON.parse(this.#text);
  }

  #checkNesting(): void {
    // Tokenization is iterative and treats quoted brackets as string contents.
    // Bound the recursive parser and subsequent validation/canonicalization.
    const scanner = createScanner(this.#text);
    const openings: string[] = [];
    while (scanner.getPosition() < this.#text.length) {
      scanner.scan();
      // Use a whole single-character lexeme, never decoded string contents.
      if (scanner.getTokenLength() !== 1) continue;
      const token = this.#text[scanner.getTokenOffset()];
      if (token === '{' || token === '[') {
        openings.push(token);
        if (openings.length > 256) throw new Error('json_nesting_limit');
      } else if (token === '}' || token === ']') {
        const expected = token === '}' ? '{' : '[';
        if (openings.pop() !== expected) throw new Error('invalid_json');
      }
    }
    if (openings.length > 0) throw new Error('invalid_json');
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
