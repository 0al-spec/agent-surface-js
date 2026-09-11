import { DataClassCatalog } from './data-class-catalog.js';
import { DataExposure } from './data-exposure.js';
import { DeclarationObject } from './declaration-object.js';
import { JsonDocument } from './json-document.js';

/** Checks only exposure grammar/coverage, not the complete manifest contract. */
export class ManifestExposureDeclarations {
  readonly #document: JsonDocument;

  constructor(document: JsonDocument) {
    this.#document = document;
  }

  validate(): void {
    // Parse the complete original bytes before extracting any declaration.
    const manifest = new DeclarationObject(
      this.#document.parse(),
      'invalid_manifest_exposure',
    );
    const catalog = new DataClassCatalog(
      new JsonDocument(JSON.stringify(manifest.list('data_classes'))),
    );
    // Prepare one private known-ID view, shared across every source in this pass.
    catalog.validate();
    for (const kind of ['resources', 'actions', 'events']) {
      const identifiers = new Set<string>();
      for (const value of manifest.list(kind)) {
        const source = new DeclarationObject(
          value,
          'invalid_manifest_exposure',
        );
        const id = source.text('id');
        if (identifiers.has(id)) source.reject();
        identifiers.add(id);
        if (!Object.hasOwn(source.record(), 'data_exposure')) source.reject();
        new DataExposure(
          new JsonDocument(JSON.stringify(source.member('data_exposure'))),
          catalog,
        ).validate();
      }
    }
  }
}
