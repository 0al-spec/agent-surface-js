import {
  CanonicalObjectHash,
  DataClassCatalog,
  DataExposure,
  JsonDocument,
  type OfflineSchemaResource,
  OfflineSchemaResources,
  type PreparedSchemaResources,
} from '@0al/agent-surface';
import type { Static, TSchema } from '@sinclair/typebox';

const ASP = 'https://github.com/0al-spec/agent-surface/';
const SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';
const INPUT_SCHEMA_HASH_DOMAIN = `${ASP}hash/action-input-schema/v1`;
const MAX_SNAPSHOT_VALUES = 4_096;
const MAX_SNAPSHOT_DEPTH = 64;
const MAX_SNAPSHOT_TEXT_UNITS = 1_000_000;
const MAX_SCHEMA_NODES = 1_024;
const MAX_SCHEMA_DEPTH = 64;
const MAX_UNION_MEMBERS = 32;

type JsonRecord = Record<string, unknown>;
const INVALID_SNAPSHOT = Symbol('invalid_snapshot');

interface RuntimeActionDefinition {
  id(): string;
  prepare(schemaBaseUri: string): PreparedActionFragment;
}

export interface ActionExposure {
  readonly classes: readonly string[];
  readonly redaction:
    | { readonly mode: 'none' }
    | {
        readonly mode: 'policy';
        readonly policy_id: string;
        readonly summary: string;
      };
  readonly retention:
    | { readonly mode: 'user_managed' }
    | { readonly mode: 'transient'; readonly delete_on_grant_end: boolean }
    | {
        readonly mode: 'bounded';
        readonly max_seconds: number;
        readonly delete_on_grant_end: boolean;
      };
}

export interface ActionWireMetadata {
  readonly id: string;
  readonly scope: string;
  readonly risk: 'propose';
  readonly side_effect: false;
  readonly approval: 'none';
  readonly execution: {
    readonly mode: 'propose';
    readonly operation_id: string;
    readonly persisted: false;
  };
  readonly data_exposure: ActionExposure;
}

export interface ActionDefinitionInput<
  InputSchema extends TSchema,
  OutputSchema extends TSchema,
> {
  readonly action: ActionWireMetadata;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly handler: (
    input: Static<InputSchema>,
  ) => Static<OutputSchema> | Promise<Static<OutputSchema>>;
}

export interface PreparedActionFragment {
  readonly document: JsonDocument;
  readonly schemaResources: readonly OfflineSchemaResource[];
  readonly inputUri: string;
  readonly inputSchemaHash: string;
  readonly outputUri: string;
}

/**
 * Private P5-T7 experiment. This prepares one offline action/schema
 * representation; it does not execute the application handler or grant
 * authority. This class is not exported from the base SDK package.
 */
export class OfflineActionDefinition<
  InputSchema extends TSchema,
  OutputSchema extends TSchema,
> {
  readonly #definition:
    | ActionDefinitionInput<InputSchema, OutputSchema>
    | undefined;

  constructor(definition: ActionDefinitionInput<InputSchema, OutputSchema>) {
    // Capture only own data properties. Accessors, cycles and unsupported object
    // shapes are retained as an invalid marker and rejected by prepare().
    try {
      this.#definition = snapshotDeclaration(
        definition,
      ) as ActionDefinitionInput<InputSchema, OutputSchema>;
    } catch {
      this.#definition = undefined;
    }
  }

  id(): string {
    return this.#definition?.action?.id ?? '';
  }

  prepare(schemaBaseUri: string): PreparedActionFragment {
    const definition = this.#definition;
    if (definition === undefined) throw new Error('invalid_action_definition');
    validateDefinition(definition);
    const inputSchema = lowerSupportedUnions(definition.input);
    const outputSchema = lowerSupportedUnions(definition.output);
    validateSchemaShape(inputSchema);
    validateSchemaShape(outputSchema);

    const base = validatedBaseUri(schemaBaseUri);
    const inputUri = schemaUri(base, definition.action.id, 'input');
    const outputUri = schemaUri(base, definition.action.id, 'output');
    const inputDocument = schemaDocument(inputUri, inputSchema);
    const outputDocument = schemaDocument(outputUri, outputSchema);
    const inputSchemaHash = new CanonicalObjectHash(
      INPUT_SCHEMA_HASH_DOMAIN,
    ).digest(inputDocument);
    const action = {
      ...definition.action,
      input_schema: inputUri,
      input_schema_hash: inputSchemaHash,
      output_schema: outputUri,
    };

    return {
      document: new JsonDocument(JSON.stringify(action)),
      schemaResources: Object.freeze([
        Object.freeze({ uri: inputUri, document: inputDocument }),
        Object.freeze({ uri: outputUri, document: outputDocument }),
      ]),
      inputUri,
      inputSchemaHash,
      outputUri,
    };
  }
}

export interface PreparedActionCatalog {
  readonly actionDocuments: readonly JsonDocument[];
  readonly schemaResources: readonly OfflineSchemaResource[];
  validateInput(actionId: string, document: JsonDocument): void;
  validateOutput(actionId: string, document: JsonDocument): void;
}

/**
 * Prepares an allow-list of explicitly declared actions. Handler references
 * remain private to their declarations and are never serialized or invoked.
 */
export class OfflineActionCatalog {
  readonly #dataClasses: JsonDocument;
  readonly #definitions: readonly RuntimeActionDefinition[];
  #prepared: PreparedActionCatalog | undefined;
  #preparedBaseUri: string | undefined;

  constructor(
    dataClasses: JsonDocument,
    definitions: readonly RuntimeActionDefinition[],
  ) {
    this.#dataClasses = dataClasses;
    // Capture allow-list membership; the caller may retain and mutate its array.
    this.#definitions = Object.freeze([...definitions]);
  }

  prepare(schemaBaseUri: string): PreparedActionCatalog {
    const base = validatedBaseUri(schemaBaseUri);
    if (this.#prepared !== undefined) {
      if (base.href !== this.#preparedBaseUri)
        throw new Error('schema_base_uri_changed');
      return this.#prepared;
    }
    if (!(this.#dataClasses instanceof JsonDocument))
      throw new Error('invalid_data_class_catalog');

    const catalog = new DataClassCatalog(this.#dataClasses);
    catalog.validate();
    const ids = new Set<string>();
    const fragments: PreparedActionFragment[] = [];
    for (const definition of this.#definitions) {
      if (!(definition instanceof OfflineActionDefinition))
        throw new Error('invalid_action_definition');
      const id = definition.id();
      if (ids.has(id)) throw new Error('duplicate_action_id');
      ids.add(id);
      const fragment = definition.prepare(base.href);
      new DataExposure(
        new JsonDocument(
          JSON.stringify(
            (fragment.document.parse() as JsonRecord).data_exposure,
          ),
        ),
        catalog,
      ).validate();
      fragments.push(fragment);
    }

    const resources = fragments.flatMap((fragment) => fragment.schemaResources);
    const resourceIds = new Set<string>();
    for (const resource of resources) {
      if (resourceIds.has(resource.uri))
        throw new Error('duplicate_schema_resource');
      resourceIds.add(resource.uri);
    }
    const preparedResources = new OfflineSchemaResources(resources).prepare();
    const actions = fragments.map((fragment) => fragment.document);
    const byId = new Map(
      actions.map((document) => {
        const action = document.parse() as JsonRecord;
        return [String(action.id), action] as const;
      }),
    );

    this.#prepared = Object.freeze({
      actionDocuments: Object.freeze(actions),
      schemaResources: Object.freeze(resources),
      validateInput: (actionId: string, document: JsonDocument) =>
        validateSelectedSchema(
          byId,
          preparedResources,
          actionId,
          document,
          true,
        ),
      validateOutput: (actionId: string, document: JsonDocument) =>
        validateSelectedSchema(
          byId,
          preparedResources,
          actionId,
          document,
          false,
        ),
    });
    this.#preparedBaseUri = base.href;
    return this.#prepared;
  }
}

function validateDefinition<
  InputSchema extends TSchema,
  OutputSchema extends TSchema,
>(definition: ActionDefinitionInput<InputSchema, OutputSchema>): void {
  if (typeof definition !== 'object' || definition === null)
    throw new Error('invalid_action_definition');
  exactKeys(
    definition as unknown as JsonRecord,
    ['action', 'input', 'output', 'handler'],
    'invalid_action_definition',
  );
  const action = definition.action as unknown as JsonRecord;
  exactKeys(
    action,
    [
      'id',
      'scope',
      'risk',
      'side_effect',
      'approval',
      'execution',
      'data_exposure',
    ],
    'unsupported_action_metadata',
  );
  requireText(action.id, 'invalid_action_id');
  requireText(action.scope, 'invalid_action_scope');
  if (
    action.risk !== 'propose' ||
    action.side_effect !== false ||
    action.approval !== 'none' ||
    typeof definition.handler !== 'function'
  )
    throw new Error('unsupported_action_metadata');

  const execution = action.execution as JsonRecord;
  exactKeys(
    execution,
    ['mode', 'operation_id', 'persisted'],
    'unsupported_execution_metadata',
  );
  if (
    execution.mode !== 'propose' ||
    execution.persisted !== false ||
    typeof execution.operation_id !== 'string' ||
    execution.operation_id.trim().length === 0
  )
    throw new Error('unsupported_execution_metadata');
}

function validateSchemaShape(schema: TSchema): void {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema))
    throw new Error('action_schema_must_be_closed_object');
  const root = schema as unknown as JsonRecord;
  if (
    root.type !== 'object' ||
    root.additionalProperties !== false ||
    typeof root.properties !== 'object' ||
    root.properties === null ||
    Array.isArray(root.properties)
  )
    throw new Error('action_schema_must_be_closed_object');
  if (Object.hasOwn(root, '$schema') || Object.hasOwn(root, '$id'))
    throw new Error('unsupported_action_schema_metadata');
  validateNestedObjects(root);
}

/** Snapshot plain declaration/schema data without invoking accessors. */
function snapshotDeclaration<T>(value: T): T {
  const active = new WeakSet<object>();
  const root = value;
  let values = 0;
  let textUnits = 0;
  const visit = (current: unknown, isHandler = false, depth = 0): unknown => {
    if (++values > MAX_SNAPSHOT_VALUES || depth > MAX_SNAPSHOT_DEPTH)
      throw INVALID_SNAPSHOT;
    if (typeof current === 'string') {
      textUnits += current.length;
      if (textUnits > MAX_SNAPSHOT_TEXT_UNITS) throw INVALID_SNAPSHOT;
    }
    if (current === undefined) throw INVALID_SNAPSHOT;
    if (current === null || typeof current !== 'object') {
      if (typeof current === 'function' && isHandler) return current;
      if (typeof current === 'function') throw INVALID_SNAPSHOT;
      if (typeof current === 'symbol' || typeof current === 'bigint')
        throw INVALID_SNAPSHOT;
      return current;
    }
    if (active.has(current)) throw INVALID_SNAPSHOT;
    if (!Array.isArray(current)) {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null)
        throw INVALID_SNAPSHOT;
    } else if (current.length > MAX_SNAPSHOT_VALUES - values) {
      throw INVALID_SNAPSHOT;
    }
    const copy: object = Array.isArray(current)
      ? new Array(current.length)
      : Object.create(Object.getPrototypeOf(current));
    active.add(current);
    const keys = Reflect.ownKeys(current);
    if (keys.length > MAX_SNAPSHOT_VALUES - values) throw INVALID_SNAPSHOT;
    for (const key of keys) {
      if (Array.isArray(current) && key === 'length') continue;
      if (typeof key === 'string') {
        textUnits += key.length;
        if (textUnits > MAX_SNAPSHOT_TEXT_UNITS) throw INVALID_SNAPSHOT;
      }
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor === undefined || !('value' in descriptor))
        throw INVALID_SNAPSHOT;
      Object.defineProperty(copy, key, {
        value: visit(
          descriptor.value,
          current === root && key === 'handler',
          depth + 1,
        ),
        enumerable: descriptor.enumerable ?? false,
        writable: true,
        configurable: true,
      });
    }
    active.delete(current);
    return copy;
  };
  return visit(value) as T;
}

/** Lower only plain TypeBox string-literal unions to the bounded JSON Schema dialect. */
function lowerSupportedUnions(schema: TSchema): TSchema {
  let expandedNodes = 0;
  const visitMap = (value: unknown, depth: number): unknown => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        visit(child, depth + 1),
      ]),
    );
  };
  const visit = (value: unknown, depth = 0): unknown => {
    if (++expandedNodes > MAX_SCHEMA_NODES || depth > MAX_SCHEMA_DEPTH)
      throw new Error('action_schema_complexity_exceeded');
    if (Array.isArray(value))
      return value.map((child) => visit(child, depth + 1));
    if (typeof value !== 'object' || value === null) return value;
    const record = value as JsonRecord;
    if (
      Object.hasOwn(record, 'anyOf') &&
      Reflect.get(record, Symbol.for('TypeBox.Kind')) === 'Union'
    ) {
      const keys = Object.keys(record);
      if (
        Reflect.ownKeys(record).some(
          (key) =>
            typeof key === 'symbol' && key !== Symbol.for('TypeBox.Kind'),
        )
      )
        throw new Error('unsupported_action_union_metadata');
      if (keys.some((key) => !['anyOf', 'type'].includes(key)))
        throw new Error('unsupported_action_union_metadata');
      if (
        (record.type !== undefined && record.type !== 'string') ||
        !Array.isArray(record.anyOf) ||
        record.anyOf.length > MAX_UNION_MEMBERS
      )
        throw new Error('unsupported_action_union');
      const values: string[] = [];
      for (const member of record.anyOf) {
        if (
          typeof member !== 'object' ||
          member === null ||
          Array.isArray(member)
        )
          throw new Error('unsupported_action_union_member');
        const literal = member as JsonRecord;
        const memberKeys = Object.keys(literal);
        if (
          Reflect.ownKeys(literal).some(
            (key) =>
              typeof key === 'symbol' && key !== Symbol.for('TypeBox.Kind'),
          ) ||
          Reflect.get(literal, Symbol.for('TypeBox.Kind')) !== 'Literal'
        )
          throw new Error('unsupported_action_union_member');
        if (
          memberKeys.some((key) => !['const', 'type'].includes(key)) ||
          member.type !== 'string' ||
          typeof literal.const !== 'string' ||
          memberKeys.length !== 2 ||
          values.includes(literal.const)
        )
          throw new Error('unsupported_action_union_member');
        values.push(literal.const);
      }
      if (values.length < 2) throw new Error('unsupported_action_union');
      return { type: 'string', enum: values };
    }
    const copy: JsonRecord = {};
    for (const key of Reflect.ownKeys(record)) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (descriptor === undefined || !('value' in descriptor))
        throw new Error('invalid_action_schema');
      Object.defineProperty(copy, key, {
        value: (() => {
          if (key === 'properties' || key === '$defs')
            return visitMap(descriptor.value, depth + 1);
          if (key === 'items' || key === 'additionalProperties')
            return visit(descriptor.value, depth + 1);
          if (key === 'prefixItems' && Array.isArray(descriptor.value))
            return descriptor.value.map((child) => visit(child, depth + 1));
          return descriptor.value;
        })(),
        enumerable: descriptor.enumerable ?? false,
        writable: true,
        configurable: true,
      });
    }
    return copy;
  };
  return visit(schema) as TSchema;
}

function validateNestedObjects(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) validateNestedObjects(item);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const record = value as JsonRecord;
  if (record.type === 'object') {
    if (
      record.additionalProperties !== false ||
      typeof record.properties !== 'object' ||
      record.properties === null ||
      Array.isArray(record.properties)
    )
      throw new Error('action_schema_must_be_closed_object');
  }
  for (const keyword of ['properties', '$defs']) {
    const children = record[keyword];
    if (
      typeof children === 'object' &&
      children !== null &&
      !Array.isArray(children)
    )
      for (const child of Object.values(children)) validateNestedObjects(child);
  }
  for (const keyword of ['items', 'additionalProperties'])
    if (Object.hasOwn(record, keyword)) validateNestedObjects(record[keyword]);
  if (Array.isArray(record.prefixItems))
    for (const child of record.prefixItems) validateNestedObjects(child);
}

function schemaDocument(uri: string, schema: TSchema): JsonDocument {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify({
      $schema: SCHEMA_DIALECT,
      $id: uri,
      ...(schema as JsonRecord),
    });
  } catch {
    throw new Error('invalid_action_schema');
  }
  if (typeof serialized !== 'string') throw new Error('invalid_action_schema');
  return new JsonDocument(serialized);
}

function validatedBaseUri(value: string): URL {
  let uri: URL;
  try {
    uri = new URL(value.endsWith('/') ? value : `${value}/`);
  } catch {
    throw new Error('invalid_schema_base_uri');
  }
  if (
    uri.protocol !== 'https:' ||
    uri.username !== '' ||
    uri.password !== '' ||
    uri.search !== '' ||
    uri.hash !== ''
  )
    throw new Error('invalid_schema_base_uri');
  return uri;
}

function schemaUri(base: URL, actionId: string, direction: string): string {
  return new URL(`${encodeURIComponent(actionId)}.${direction}.json`, base)
    .href;
}

function requireText(value: unknown, error: string): void {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > 256
  )
    throw new Error(error);
}

function exactKeys(
  value: unknown,
  required: readonly string[],
  error: string,
): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(error);
  const record = value as JsonRecord;
  if (
    Object.keys(record).length !== required.length ||
    Object.keys(record).some((key) => !required.includes(key))
  )
    throw new Error(error);
}

function validateSelectedSchema(
  actions: ReadonlyMap<string, JsonRecord>,
  schemas: PreparedSchemaResources,
  actionId: string,
  document: JsonDocument,
  input: boolean,
): void {
  const action = actions.get(actionId);
  if (action === undefined) throw new Error('action_not_declared');
  const uri = input ? action.input_schema : action.output_schema;
  if (typeof uri !== 'string')
    throw new Error('invalid_action_schema_reference');
  if (input) {
    const inputHash = action.input_schema_hash;
    if (typeof inputHash !== 'string')
      throw new Error('invalid_action_schema_hash');
    schemas.resolveInput(uri, inputHash).validate(document);
  } else {
    schemas.resolve(uri).validate(document);
  }
}
