import type { DataClassCatalog } from './data-class-catalog.js';
import { DeclarationObject } from './declaration-object.js';
import { JsonDocument } from './json-document.js';

/** Validates the selected closed declaration grammar, not disclosure authority. */
export class DataExposure {
  readonly #document: JsonDocument;
  readonly #catalog: DataClassCatalog;

  constructor(document: JsonDocument, catalog: DataClassCatalog) {
    this.#document = document;
    this.#catalog = catalog;
  }

  validate(): void {
    const exposure = new DeclarationObject(
      this.#document.parse(),
      'invalid_data_exposure',
    );
    exposure.fields(
      ['classes', 'redaction', 'retention'],
      [],
      'unsupported_data_exposure',
    );
    this.#catalog.validateClasses(
      new JsonDocument(JSON.stringify(exposure.list('classes'))),
    );
    this.#redaction(exposure.member('redaction'));
    this.#retention(exposure.member('retention'));
  }

  #redaction(value: unknown): void {
    const redaction = new DeclarationObject(value, 'invalid_data_exposure');
    switch (redaction.text('mode')) {
      case 'none':
        if (
          Object.hasOwn(redaction.record(), 'policy_id') ||
          Object.hasOwn(redaction.record(), 'summary')
        )
          redaction.reject();
        redaction.fields(['mode'], [], 'unsupported_data_exposure');
        return;
      case 'policy':
        redaction.fields(
          ['mode', 'policy_id', 'summary'],
          [],
          'unsupported_data_exposure',
        );
        redaction.text('policy_id');
        redaction.text('summary');
        return;
      default:
        redaction.reject();
    }
  }

  #retention(value: unknown): void {
    const retention = new DeclarationObject(value, 'invalid_data_exposure');
    switch (retention.text('mode')) {
      case 'user_managed':
        retention.fields(['mode']);
        return;
      case 'transient':
        if (Object.hasOwn(retention.record(), 'max_seconds'))
          retention.reject();
        retention.fields(
          ['mode', 'delete_on_grant_end'],
          [],
          'unsupported_data_exposure',
        );
        break;
      case 'bounded':
        retention.fields(
          ['mode', 'max_seconds', 'delete_on_grant_end'],
          [],
          'unsupported_data_exposure',
        );
        if (
          !Number.isSafeInteger(retention.member('max_seconds')) ||
          Number(retention.member('max_seconds')) <= 0
        )
          retention.reject();
        break;
      default:
        retention.reject();
    }
    if (typeof retention.member('delete_on_grant_end') !== 'boolean')
      retention.reject();
  }
}
