import { CanonicalObjectHash } from '../canonical-object-hash.js';
import { DataClassCatalog } from '../data-class-catalog.js';
import { DataExposure } from '../data-exposure.js';
import { DeclarationObject } from '../declaration-object.js';
import { JsonDocument } from '../json-document.js';
import {
  type OfflineSchemaResource,
  OfflineSchemaResources,
  type PreparedSchemaResources,
} from '../offline-schema-resources.js';
import { CapturedDeclarations } from './captured-declarations.js';
import { TypeBoxSchema } from './typebox-schema.js';
import type { ActionDeclaration, PreparedActionInventory } from './types.js';

const INPUT_DOMAIN =
  'https://github.com/0al-spec/agent-surface/hash/action-input-schema/v1';
interface ActionSchemas {
  readonly input: string;
  readonly inputHash: string;
  readonly output: string;
}

/** Offline descriptor preparation. Construction only captures bounded data. */
export class OfflineActionInventory {
  readonly #declarations: CapturedDeclarations;
  readonly #dataClasses: JsonDocument;
  #prepared: PreparedActionInventory | undefined;
  #base: string | undefined;

  constructor(
    dataClasses: JsonDocument,
    declarations: readonly ActionDeclaration[],
  ) {
    this.#dataClasses = dataClasses;
    this.#declarations = new CapturedDeclarations(declarations);
  }

  /** Qualify the complete resource set atomically; never grants or executes. */
  prepare(schemaBaseUri: string): PreparedActionInventory {
    const base = normalizedBase(schemaBaseUri);
    if (this.#prepared !== undefined) {
      if (base !== this.#base) throw new Error('schema_base_uri_changed');
      return this.#prepared;
    }
    const declarations = this.#declarations.declarations();
    // Two schema resources per declaration; keep the base resource-set limit.
    if (declarations.length > 8) throw new Error('schema_resource_count_limit');
    if (!(this.#dataClasses instanceof JsonDocument))
      throw new Error('invalid_data_class_catalog');
    this.#dataClasses.parse(64 * 1024);
    const catalog = new DataClassCatalog(this.#dataClasses);
    catalog.validate();
    const resources: OfflineSchemaResource[] = [];
    const documents: JsonDocument[] = [];
    const actions = new Map<string, ActionSchemas>();
    const uris = new Set<string>();
    for (const candidate of declarations) {
      const declaration = new DeclarationObject(
        candidate,
        'invalid_action_declaration',
      );
      declaration.fields(['action', 'input', 'output']);
      if (Object.getOwnPropertySymbols(declaration.record()).length !== 0)
        declaration.reject();
      const action = new DeclarationObject(
        declaration.member('action'),
        'unsupported_action_metadata',
      );
      rejectSymbols(action.record());
      action.fields([
        'id',
        'scope',
        'risk',
        'side_effect',
        'approval',
        'execution',
        'data_exposure',
      ]);
      const id = text(action.text('id'), 'invalid_action_id');
      text(action.text('scope'), 'invalid_action_scope');
      if (
        action.member('risk') !== 'propose' ||
        action.member('side_effect') !== false ||
        action.member('approval') !== 'none'
      )
        action.reject();
      const execution = new DeclarationObject(
        action.member('execution'),
        'unsupported_execution_metadata',
      );
      execution.fields(['mode', 'operation_id', 'persisted']);
      text(execution.text('operation_id'), 'unsupported_execution_metadata');
      if (
        execution.member('mode') !== 'propose' ||
        execution.member('persisted') !== false
      )
        execution.reject();
      new DataExposure(
        new JsonDocument(JSON.stringify(action.member('data_exposure'))),
        catalog,
      ).validate();
      if (actions.has(id)) throw new Error('duplicate_action_id');
      const input = new URL(`${encodeURIComponent(id)}.input.json`, base).href;
      const output = new URL(`${encodeURIComponent(id)}.output.json`, base)
        .href;
      for (const uri of [input, output]) {
        if (uris.has(uri)) throw new Error('duplicate_schema_resource');
        uris.add(uri);
      }
      const inputDocument = new TypeBoxSchema(
        declaration.member('input'),
      ).document(input);
      const outputDocument = new TypeBoxSchema(
        declaration.member('output'),
      ).document(output);
      const inputHash = new CanonicalObjectHash(INPUT_DOMAIN).digest(
        inputDocument,
      );
      const document = new JsonDocument(
        JSON.stringify({
          ...action.record(),
          input_schema: input,
          input_schema_hash: inputHash,
          output_schema: output,
        }),
      );
      document.parse();
      documents.push(document);
      resources.push(
        Object.freeze({ uri: input, document: inputDocument }),
        Object.freeze({ uri: output, document: outputDocument }),
      );
      actions.set(id, { input, inputHash, output });
    }
    const schemas = new OfflineSchemaResources(resources).prepare();
    const prepared = Object.freeze(
      new PreparedInventory(
        Object.freeze(documents),
        Object.freeze(resources),
        actions,
        schemas,
      ),
    );
    this.#base = base;
    this.#prepared = prepared;
    return prepared;
  }
}

class PreparedInventory implements PreparedActionInventory {
  readonly actionDocuments: readonly JsonDocument[];
  readonly schemaResources: readonly OfflineSchemaResource[];
  readonly #actions: ReadonlyMap<string, ActionSchemas>;
  readonly #schemas: PreparedSchemaResources;

  constructor(
    documents: readonly JsonDocument[],
    resources: readonly OfflineSchemaResource[],
    actions: ReadonlyMap<string, ActionSchemas>,
    schemas: PreparedSchemaResources,
  ) {
    this.actionDocuments = documents;
    this.schemaResources = resources;
    this.#actions = actions;
    this.#schemas = schemas;
  }

  validateInput(actionId: string, document: JsonDocument): void {
    const action = this.#action(actionId);
    this.#schemas
      .resolveInput(action.input, action.inputHash)
      .validate(document);
  }

  validateOutput(actionId: string, document: JsonDocument): void {
    this.#schemas.resolve(this.#action(actionId).output).validate(document);
  }

  #action(id: string): ActionSchemas {
    const action = this.#actions.get(id);
    if (action === undefined) throw new Error('action_not_declared');
    return action;
  }
}

function text(value: string, error: string): string {
  if (value.length > 256 || /[\uD800-\uDFFF]/u.test(value))
    throw new Error(error);
  return value;
}

function normalizedBase(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length > 2_048 ||
    !/^https:\/\//u.test(value) ||
    /[\s\\?#^|]/u.test(value) ||
    /%(?![0-9A-Fa-f]{2})/u.test(value) ||
    /[\uD800-\uDFFF]/u.test(value)
  )
    throw new Error('invalid_schema_base_uri');
  try {
    const uri = new URL(value.endsWith('/') ? value : `${value}/`);
    if (
      uri.protocol !== 'https:' ||
      uri.username ||
      uri.password ||
      uri.search ||
      uri.hash ||
      // Match the base resource validator's normalized path alphabet, even
      // when an empty inventory has no resources to pass through it.
      /[^A-Za-z0-9._~!$&'()*+,;=:@%/-]/u.test(uri.pathname)
    )
      throw new Error();
    return uri.href;
  } catch {
    throw new Error('invalid_schema_base_uri');
  }
}

// Snapshot bounds already limit this traversal. Metadata must remain ordinary
// JSON; symbol properties must never disappear through JSON.stringify.
function rejectSymbols(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  if (Object.getOwnPropertySymbols(value).length !== 0)
    throw new Error('unsupported_action_metadata');
  for (const child of Object.values(value)) rejectSymbols(child);
}
