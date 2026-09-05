import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import type { JsonDocument } from './json-document.js';

/** Hashes an already selected ASP hashing view, including all its members. */
export class CanonicalObjectHash {
  readonly #domain: string;

  constructor(domain: string) {
    this.#domain = domain;
  }

  digest(view: JsonDocument): string {
    const bytes = canonicalize({ domain: this.#domain, object: view.parse() });
    if (bytes === undefined) throw new Error('invalid_json');
    return `sha-256:${createHash('sha256').update(bytes, 'utf8').digest('base64url')}`;
  }
}
