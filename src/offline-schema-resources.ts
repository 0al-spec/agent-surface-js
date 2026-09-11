import type { AnySchema, ValidateFunction } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { CanonicalObjectHash } from './canonical-object-hash.js';
import { JsonDocument } from './json-document.js';

const DIALECT = 'https://json-schema.org/draft/2020-12/schema';
const INPUT_SCHEMA_HASH_DOMAIN =
  'https://github.com/0al-spec/agent-surface/hash/action-input-schema/v1';
const URI_CHARACTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~:/?@!$&'()*+,;=%[]";
const FRAGMENT_CHARACTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~:/?@!$&'()*+,;=%";

const MAX_RESOURCES = 16;
const MAX_RESOURCE_BYTES = 64 * 1024;
const MAX_AGGREGATE_BYTES = 256 * 1024;
const MAX_SCHEMA_NODES = 256;
const MAX_AGGREGATE_SCHEMA_NODES = 512;
const MAX_SCHEMA_DEPTH = 32;
const MAX_SCHEMA_MAP_MEMBERS = 64;
const MAX_PREFIX_ITEMS = 32;
const MAX_ENUM_VALUES = 32;
const MAX_REQUIRED_MEMBERS = 64;
const MAX_ASSERTION_LITERAL_UNITS = 4_096;
const MAX_REFERENCES = 64;
const MAX_AGGREGATE_REFERENCES = 128;
const MAX_REFERENCE_EXPANSION = 2_048;
const MAX_EVALUATION_DEPTH = 64;
const MAX_STATIC_EVALUATION_WEIGHT = 8_192;
const MAX_INSTANCE_BYTES = 64 * 1024;
const MAX_INSTANCE_NODES = 4_096;
const MAX_INSTANCE_DEPTH = 64;
const MAX_INSTANCE_WORK = 262_144;

const SUPPORTED_KEYWORDS = new Set([
  '$comment',
  '$defs',
  '$id',
  '$ref',
  '$schema',
  'additionalProperties',
  'const',
  'default',
  'deprecated',
  'description',
  'enum',
  'examples',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'items',
  'maximum',
  'maxItems',
  'maxLength',
  'maxProperties',
  'minimum',
  'minItems',
  'minLength',
  'minProperties',
  'prefixItems',
  'properties',
  'readOnly',
  'required',
  'title',
  'type',
  'writeOnly',
]);

const REFERENCE_KEYWORDS = new Set([
  '$anchor',
  '$dynamicAnchor',
  '$dynamicRef',
  '$recursiveAnchor',
  '$recursiveRef',
]);

const RESERVED_MEMBER_NAMES = new Set([
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__proto__',
  'constructor',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'prototype',
  'toLocaleString',
  'toString',
  'valueOf',
]);

const SIMPLE_ASSERTIONS = new Set([
  'additionalProperties',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'items',
  'maximum',
  'maxItems',
  'maxLength',
  'maxProperties',
  'minimum',
  'minItems',
  'minLength',
  'minProperties',
  'prefixItems',
  'properties',
  'type',
]);

export interface OfflineSchemaResource {
  readonly uri: string;
  readonly document: JsonDocument;
}

/** A prepared, bounded Draft 2020-12 validator with no engine escape hatch. */
export interface PreparedSchema {
  validate(instance: JsonDocument): void;
}

/** Exact-key resolution over one successfully prepared immutable resource set. */
export interface PreparedSchemaResources {
  resolve(uri: string): PreparedSchema;
  resolveInput(uri: string, inputSchemaHash: string): PreparedSchema;
}

interface StoredResource {
  readonly uri: unknown;
  readonly document: unknown;
}

interface ValidStoredResource {
  readonly uri: string;
  readonly document: JsonDocument;
}

interface PreparedResource {
  readonly document: JsonDocument;
  readonly inputHash: string;
  readonly schema: PreparedSchema;
}

interface QualifiedSchema {
  readonly nodes: number;
  readonly references: number;
  readonly evaluationWeight: number;
}

interface SchemaNode {
  readonly edges: SchemaNode[];
  readonly weight: number;
  ref: string | undefined;
}

interface Expansion {
  readonly visits: number;
  readonly weight: number;
}

/**
 * Immutable, host-supplied schema resources. Construction performs no parsing,
 * compilation, resolution, hashing, or I/O.
 */
export class OfflineSchemaResources {
  readonly #resources: readonly StoredResource[];
  #prepared: PreparedSchemaResources | undefined;

  constructor(resources: readonly OfflineSchemaResource[]) {
    const captured: StoredResource[] = [];
    const count = Math.min(resources.length, MAX_RESOURCES + 1);
    for (let index = 0; index < count; index += 1) {
      const resource = resources[index];
      if (resource === undefined) {
        captured.push({ uri: undefined, document: undefined });
      } else {
        captured.push({ uri: resource.uri, document: resource.document });
      }
    }
    this.#resources = captured;
  }

  /** Qualifies and compiles the complete set atomically, then caches success. */
  prepare(): PreparedSchemaResources {
    if (this.#prepared !== undefined) return this.#prepared;
    if (this.#resources.length > MAX_RESOURCES) {
      throw new Error('schema_resource_count_limit');
    }

    const staged = new Map<string, PreparedResource>();
    let aggregateBytes = 0;
    let aggregateNodes = 0;
    let aggregateReferences = 0;

    for (const candidate of this.#resources) {
      const resource = this.#validatedResource(candidate, staged);
      const bytes = resource.document.utf8ByteLength();
      if (bytes > MAX_RESOURCE_BYTES) {
        throw new Error('schema_resource_byte_limit');
      }
      aggregateBytes += bytes;
      if (aggregateBytes > MAX_AGGREGATE_BYTES) {
        throw new Error('schema_aggregate_byte_limit');
      }

      const parsed = this.#parseSchema(resource.document);
      const schema = this.#validatedRoot(resource.uri, parsed);
      const qualification = new SchemaQualification(schema).qualify();
      aggregateNodes += qualification.nodes;
      if (aggregateNodes > MAX_AGGREGATE_SCHEMA_NODES) {
        throw new Error('schema_aggregate_node_limit');
      }
      aggregateReferences += qualification.references;
      if (aggregateReferences > MAX_AGGREGATE_REFERENCES) {
        throw new Error('schema_aggregate_reference_limit');
      }

      freezeJson(schema);
      const validator = compile(schema);
      const inputHash = new CanonicalObjectHash(
        INPUT_SCHEMA_HASH_DOMAIN,
      ).digest(resource.document);
      staged.set(resource.uri, {
        document: resource.document,
        inputHash,
        schema: new EnginePreparedSchema(
          validator,
          qualification.evaluationWeight,
        ),
      });
    }

    const prepared = new ExactPreparedSchemaResources(staged);
    this.#prepared = prepared;
    return prepared;
  }

  #validatedResource(
    resource: StoredResource,
    staged: ReadonlyMap<string, PreparedResource>,
  ): ValidStoredResource {
    if (!(resource.document instanceof JsonDocument)) {
      throw new Error('invalid_schema_resource');
    }
    if (!validResourceUri(resource.uri)) {
      throw new Error('invalid_schema_resource_uri');
    }
    if (staged.has(resource.uri)) {
      throw new Error('duplicate_schema_resource');
    }
    return { uri: resource.uri, document: resource.document };
  }

  #parseSchema(document: JsonDocument): unknown {
    try {
      return document.parse(MAX_RESOURCE_BYTES);
    } catch (error) {
      if (error instanceof Error && error.message === 'json_byte_limit') {
        throw new Error('schema_resource_byte_limit');
      }
      throw error;
    }
  }

  #validatedRoot(uri: string, schema: unknown): Record<string, unknown> {
    if (!isRecord(schema)) throw new Error('schema_object_required');
    if (schema.$schema !== DIALECT) {
      throw new Error('schema_dialect_unsupported');
    }
    if (Object.hasOwn(schema, '$id') && schema.$id !== uri) {
      throw new Error('schema_id_mismatch');
    }
    return schema;
  }
}

class ExactPreparedSchemaResources implements PreparedSchemaResources {
  readonly #resources: ReadonlyMap<string, PreparedResource>;

  constructor(resources: ReadonlyMap<string, PreparedResource>) {
    this.#resources = new Map(resources);
  }

  resolve(uri: string): PreparedSchema {
    return this.#resource(uri).schema;
  }

  resolveInput(uri: string, inputSchemaHash: string): PreparedSchema {
    const resource = this.#resource(uri);
    if (inputSchemaHash !== resource.inputHash) {
      throw new Error('input_schema_hash_mismatch');
    }
    return resource.schema;
  }

  #resource(uri: string): PreparedResource {
    const resource = this.#resources.get(uri);
    if (resource === undefined) throw new Error('schema_resource_missing');
    return resource;
  }
}

class EnginePreparedSchema implements PreparedSchema {
  readonly #validator: ValidateFunction;
  readonly #evaluationWeight: number;

  constructor(validator: ValidateFunction, evaluationWeight: number) {
    this.#validator = validator;
    this.#evaluationWeight = evaluationWeight;
  }

  validate(document: JsonDocument): void {
    if (!(document instanceof JsonDocument)) {
      throw new Error('invalid_schema_instance');
    }
    let instance: unknown;
    try {
      instance = document.parse(MAX_INSTANCE_BYTES);
    } catch (error) {
      if (error instanceof Error && error.message === 'json_byte_limit') {
        throw new Error('schema_instance_byte_limit');
      }
      throw error;
    }
    const units = instanceUnits(instance);
    if (units > Math.floor(MAX_INSTANCE_WORK / this.#evaluationWeight)) {
      throw new Error('schema_instance_work_limit');
    }

    let valid: boolean;
    try {
      valid = this.#validator(instance) as boolean;
    } catch {
      throw new Error('schema_engine_failure');
    }
    if (!valid) throw new Error('schema_instance_invalid');
  }
}

class SchemaQualification {
  readonly #schema: unknown;
  readonly #locations = new Map<string, SchemaNode>();
  readonly #nodes: SchemaNode[] = [];
  #references = 0;
  #literalUnits = 0;

  constructor(schema: unknown) {
    this.#schema = schema;
  }

  qualify(): QualifiedSchema {
    const root = this.#visit(this.#schema, [], 0);
    this.#resolveReferences();
    this.#rejectCycles();

    let rootExpansion: Expansion | undefined;
    for (const node of this.#nodes) {
      const expansion = this.#expansion(node, 0);
      if (node === root) rootExpansion = expansion;
    }
    if (rootExpansion === undefined) throw new Error('schema_invalid');
    return {
      nodes: this.#nodes.length,
      references: this.#references,
      evaluationWeight: rootExpansion.weight,
    };
  }

  #visit(schema: unknown, path: readonly string[], depth: number): SchemaNode {
    if (depth > MAX_SCHEMA_DEPTH) throw new Error('schema_depth_limit');
    if (typeof schema !== 'boolean' && !isRecord(schema)) {
      throw new Error('schema_invalid');
    }
    if (this.#nodes.length >= MAX_SCHEMA_NODES) {
      throw new Error('schema_node_limit');
    }

    if (typeof schema === 'boolean') {
      const node: SchemaNode = {
        edges: [],
        weight: 1,
        ref: undefined,
      };
      this.#nodes.push(node);
      this.#locations.set(locationKey(path), node);
      return node;
    }

    for (const keyword of Object.keys(schema)) {
      if (REFERENCE_KEYWORDS.has(keyword)) {
        throw new Error('schema_reference_unsupported');
      }
      if (!SUPPORTED_KEYWORDS.has(keyword)) {
        throw new Error('schema_keyword_unsupported');
      }
    }
    if (path.length > 0 && Object.hasOwn(schema, '$schema')) {
      throw new Error('schema_dialect_unsupported');
    }
    if (path.length > 0 && Object.hasOwn(schema, '$id')) {
      throw new Error('schema_nested_id_unsupported');
    }
    if (Array.isArray(schema.type)) {
      throw new Error('schema_feature_unsupported');
    }

    const node: SchemaNode = {
      edges: [],
      weight: this.#weight(schema),
      ref: undefined,
    };
    this.#nodes.push(node);
    this.#locations.set(locationKey(path), node);

    if (Object.hasOwn(schema, '$ref')) {
      if (typeof schema.$ref !== 'string') throw new Error('schema_invalid');
      node.ref = schema.$ref;
      this.#references += 1;
      if (this.#references > MAX_REFERENCES) {
        throw new Error('schema_reference_limit');
      }
    }

    this.#visitMap(schema, '$defs', path, depth, undefined);
    this.#visitMap(schema, 'properties', path, depth, node);
    this.#visitArray(schema, 'prefixItems', path, depth, node);
    this.#visitChild(schema, 'items', path, depth, node);
    this.#visitChild(schema, 'additionalProperties', path, depth, node);
    return node;
  }

  #visitMap(
    schema: Record<string, unknown>,
    keyword: '$defs' | 'properties',
    path: readonly string[],
    depth: number,
    evaluatingParent: SchemaNode | undefined,
  ): void {
    if (!Object.hasOwn(schema, keyword)) return;
    const values = schema[keyword];
    if (!isRecord(values)) throw new Error('schema_invalid');
    const entries = Object.entries(values);
    if (entries.length > MAX_SCHEMA_MAP_MEMBERS) {
      throw new Error('schema_map_member_limit');
    }
    for (const [name, child] of entries) {
      if (RESERVED_MEMBER_NAMES.has(name)) {
        throw new Error('schema_reserved_name_unsupported');
      }
      const childNode = this.#visit(child, [...path, keyword, name], depth + 1);
      evaluatingParent?.edges.push(childNode);
    }
  }

  #visitArray(
    schema: Record<string, unknown>,
    keyword: 'prefixItems',
    path: readonly string[],
    depth: number,
    parent: SchemaNode,
  ): void {
    if (!Object.hasOwn(schema, keyword)) return;
    const values = schema[keyword];
    if (!Array.isArray(values)) throw new Error('schema_invalid');
    if (values.length > MAX_PREFIX_ITEMS) {
      throw new Error('schema_prefix_item_limit');
    }
    for (const [index, child] of values.entries()) {
      parent.edges.push(
        this.#visit(child, [...path, keyword, String(index)], depth + 1),
      );
    }
  }

  #visitChild(
    schema: Record<string, unknown>,
    keyword: 'additionalProperties' | 'items',
    path: readonly string[],
    depth: number,
    parent: SchemaNode,
  ): void {
    if (!Object.hasOwn(schema, keyword)) return;
    parent.edges.push(
      this.#visit(schema[keyword], [...path, keyword], depth + 1),
    );
  }

  #weight(schema: Record<string, unknown>): number {
    let weight = 1;
    for (const keyword of Object.keys(schema)) {
      if (SIMPLE_ASSERTIONS.has(keyword)) weight += 1;
    }
    if (Object.hasOwn(schema, 'required')) {
      if (!Array.isArray(schema.required)) throw new Error('schema_invalid');
      if (schema.required.length > MAX_REQUIRED_MEMBERS) {
        throw new Error('schema_required_member_limit');
      }
      if (schema.required.some((name) => RESERVED_MEMBER_NAMES.has(name))) {
        throw new Error('schema_reserved_name_unsupported');
      }
      weight += schema.required.length;
      for (const name of schema.required) {
        if (typeof name === 'string') weight += name.length;
      }
    }
    if (Object.hasOwn(schema, 'properties')) {
      if (!isRecord(schema.properties)) throw new Error('schema_invalid');
      for (const name of Object.keys(schema.properties)) weight += name.length;
    }
    if (Object.hasOwn(schema, 'enum')) {
      if (!Array.isArray(schema.enum)) throw new Error('schema_invalid');
      if (schema.enum.length > MAX_ENUM_VALUES) {
        throw new Error('schema_enum_limit');
      }
      const units = literalUnits(schema.enum);
      this.#literalUnits += units;
      weight += units;
    }
    if (Object.hasOwn(schema, 'const')) {
      const units = literalUnits(schema.const);
      this.#literalUnits += units;
      weight += units;
    }
    if (this.#literalUnits > MAX_ASSERTION_LITERAL_UNITS) {
      throw new Error('schema_assertion_literal_limit');
    }
    return weight;
  }

  #resolveReferences(): void {
    for (const node of this.#nodes) {
      if (node.ref === undefined) continue;
      const target = this.#locations.get(pointerLocation(node.ref));
      if (target === undefined) {
        throw new Error('schema_reference_target_unsupported');
      }
      node.edges.push(target);
    }
  }

  #rejectCycles(): void {
    const complete = new Set<SchemaNode>();
    const active = new Set<SchemaNode>();
    const visit = (node: SchemaNode): void => {
      if (active.has(node)) throw new Error('schema_reference_cycle');
      if (complete.has(node)) return;
      active.add(node);
      for (const target of node.edges) visit(target);
      active.delete(node);
      complete.add(node);
    };
    for (const node of this.#nodes) visit(node);
  }

  #expansion(node: SchemaNode, depth: number): Expansion {
    if (depth > MAX_EVALUATION_DEPTH) {
      throw new Error('schema_reference_expansion_limit');
    }
    let visits = 1;
    let weight = node.weight;
    if (weight > MAX_STATIC_EVALUATION_WEIGHT) {
      throw new Error('schema_static_work_limit');
    }
    for (const target of node.edges) {
      const child = this.#expansion(target, depth + 1);
      visits += child.visits;
      weight += child.weight;
      if (visits > MAX_REFERENCE_EXPANSION) {
        throw new Error('schema_reference_expansion_limit');
      }
      if (weight > MAX_STATIC_EVALUATION_WEIGHT) {
        throw new Error('schema_static_work_limit');
      }
    }
    return { visits, weight };
  }
}

function compile(schema: Record<string, unknown>): ValidateFunction {
  try {
    const engine = new Ajv2020({
      addUsedSchema: false,
      allErrors: false,
      coerceTypes: false,
      inlineRefs: false,
      logger: false,
      loopEnum: 16,
      loopRequired: 16,
      messages: false,
      ownProperties: true,
      removeAdditional: false,
      strict: true,
      strictTuples: false,
      useDefaults: false,
      validateSchema: true,
    });
    const engineSchema = schema as AnySchema;
    if (!engine.validateSchema(engineSchema)) throw new Error('schema_invalid');
    return engine.compile(engineSchema);
  } catch {
    throw new Error('schema_invalid');
  }
}

function validResourceUri(uri: unknown): uri is string {
  if (
    typeof uri !== 'string' ||
    !/^https:\/\/[^/?#@]+(?:[/?]|$)/u.test(uri) ||
    !hasOnlyCharacters(uri, URI_CHARACTERS) ||
    !hasValidPercentEncoding(uri)
  ) {
    return false;
  }
  const remainder = uri.slice('https://'.length);
  const separator = remainder.search(/[/?]/u);
  const authority = separator < 0 ? remainder : remainder.slice(0, separator);
  const pathAndQuery = separator < 0 ? '' : remainder.slice(separator);
  if (authority.includes('@') || /[[\]]/u.test(pathAndQuery)) return false;
  try {
    const parsed = new URL(uri);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname.length > 0 &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.hash.length === 0
    );
  } catch {
    return false;
  }
}

function pointerLocation(reference: string): string {
  if (!reference.startsWith('#')) {
    throw new Error('schema_reference_unsupported');
  }
  const fragment = reference.slice(1);
  if (
    !hasOnlyCharacters(fragment, FRAGMENT_CHARACTERS) ||
    !hasValidPercentEncoding(fragment)
  ) {
    throw new Error('schema_reference_unsupported');
  }
  let pointer: string;
  try {
    pointer = decodeURIComponent(fragment);
  } catch {
    throw new Error('schema_reference_unsupported');
  }
  if (pointer === '') return locationKey([]);
  if (!pointer.startsWith('/')) {
    throw new Error('schema_reference_unsupported');
  }
  const tokens = pointer.slice(1).split('/').map(unescapePointerToken);
  return locationKey(tokens);
}

function hasOnlyCharacters(value: string, characters: string): boolean {
  for (const character of value) {
    if (!characters.includes(character)) return false;
  }
  return true;
}

function hasValidPercentEncoding(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '%') continue;
    const encodedByte = value.slice(index + 1, index + 3);
    if (!/^[0-9A-Fa-f]{2}$/u.test(encodedByte)) return false;
    index += 2;
  }
  return true;
}

function unescapePointerToken(token: string): string {
  let result = '';
  for (let index = 0; index < token.length; index += 1) {
    const character = token[index];
    if (character !== '~') {
      result += character;
      continue;
    }
    const escaped = token[index + 1];
    if (escaped === '0') result += '~';
    else if (escaped === '1') result += '/';
    else throw new Error('schema_reference_unsupported');
    index += 1;
  }
  return result;
}

function locationKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function literalUnits(value: unknown): number {
  let units = 0;
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    units += 1;
    if (typeof current === 'string') units += current.length;
    else if (Array.isArray(current)) pending.push(...current);
    else if (isRecord(current)) {
      for (const [key, child] of Object.entries(current)) {
        if (RESERVED_MEMBER_NAMES.has(key)) {
          throw new Error('schema_reserved_name_unsupported');
        }
        units += key.length;
        pending.push(child);
      }
    }
    if (units > MAX_ASSERTION_LITERAL_UNITS) return units;
  }
  return units;
}

function instanceUnits(value: unknown): number {
  let nodes = 0;
  let units = 0;
  const pending: Array<{ readonly value: unknown; readonly depth: number }> = [
    { value, depth: 0 },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) throw new Error('invalid_schema_instance');
    nodes += 1;
    units += 1;
    if (nodes > MAX_INSTANCE_NODES) {
      throw new Error('schema_instance_node_limit');
    }
    if (current.depth > MAX_INSTANCE_DEPTH) {
      throw new Error('schema_instance_depth_limit');
    }
    if (typeof current.value === 'string') {
      units += current.value.length;
    } else if (Array.isArray(current.value)) {
      for (const child of current.value) {
        pending.push({ value: child, depth: current.depth + 1 });
      }
    } else if (isRecord(current.value)) {
      for (const [key, child] of Object.entries(current.value)) {
        units += key.length;
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
    if (units > MAX_INSTANCE_WORK) {
      throw new Error('schema_instance_work_limit');
    }
  }
  return units;
}

function freezeJson(value: unknown): void {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current !== 'object' || current === null) continue;
    if (Array.isArray(current)) pending.push(...current);
    else pending.push(...Object.values(current));
    Object.freeze(current);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
