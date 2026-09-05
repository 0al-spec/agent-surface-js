import { CanonicalObjectHash } from './canonical-object-hash.js';
import { JsonDocument } from './json-document.js';

const DOMAIN = 'https://github.com/0al-spec/agent-surface/hash/manifest/v1';

/** Content integrity only; full manifest schema/admission validation is separate. */
export class SurfaceSnapshot {
  readonly #document: JsonDocument;

  constructor(document: JsonDocument) {
    this.#document = document;
  }

  hash(): string {
    const manifest = this.#document.parse();
    if (
      manifest === null ||
      typeof manifest !== 'object' ||
      Array.isArray(manifest)
    ) {
      throw new Error('manifest_object_required');
    }
    const { surface_hash: supplied, ...view } = manifest as Record<
      string,
      unknown
    >;
    const digest = new CanonicalObjectHash(DOMAIN).digest(
      new JsonDocument(JSON.stringify(view)),
    );
    if (Object.hasOwn(manifest, 'surface_hash') && supplied !== digest) {
      throw new Error('surface_hash_mismatch');
    }
    return digest;
  }
}
