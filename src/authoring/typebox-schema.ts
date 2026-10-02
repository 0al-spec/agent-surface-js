import { JsonDocument } from '../json-document.js';

const KIND = Symbol.for('TypeBox.Kind');
const DIALECT = 'https://json-schema.org/draft/2020-12/schema';
type RecordValue = Record<string, unknown>;

/** Lower only the selected TypeBox grammar, never execute its callbacks. */
export class TypeBoxSchema {
  readonly #value: unknown;

  constructor(value: unknown) {
    this.#value = value;
  }

  document(uri: string): JsonDocument {
    let nodes = 0;
    const visit = (value: unknown, depth: number): RecordValue => {
      if (++nodes > 1_024 || depth > 64)
        throw new Error('action_schema_complexity_exceeded');
      const schema = record(value);
      const symbols = Object.getOwnPropertySymbols(schema);
      if (symbols.length !== 1 || symbols[0] !== KIND)
        throw new Error('unsupported_action_schema_metadata');
      const kind: unknown = Reflect.get(schema, KIND);
      if (depth === 0 && kind !== 'Object')
        throw new Error('action_schema_must_be_closed_object');
      switch (kind) {
        case 'Object': {
          keys(
            schema,
            ['type', 'properties', 'additionalProperties'],
            ['required'],
          );
          const properties = record(schema.properties);
          if (
            Object.getOwnPropertySymbols(properties).length !== 0 ||
            schema.type !== 'object' ||
            schema.additionalProperties !== false
          )
            throw new Error('action_schema_must_be_closed_object');
          const names = Object.keys(properties);
          const required = schema.required;
          if (
            required === undefined
              ? names.length !== 0
              : !Array.isArray(required) ||
                required.length !== names.length ||
                new Set(required).size !== names.length ||
                required.some(
                  (name) =>
                    typeof name !== 'string' ||
                    !Object.hasOwn(properties, name),
                )
          )
            throw new Error('action_schema_required_fields');
          const lowered = Object.fromEntries(
            Object.entries(properties).map(([name, child]) => [
              name,
              visit(child, depth + 1),
            ]),
          );
          return {
            type: 'object',
            properties: lowered,
            additionalProperties: false,
            ...(required === undefined ? {} : { required }),
          };
        }
        case 'Number':
        case 'String':
          keys(schema, ['type']);
          if (schema.type !== (kind === 'Number' ? 'number' : 'string'))
            throw new Error('unsupported_action_schema');
          return { type: schema.type };
        case 'Literal':
          keys(schema, ['type', 'const']);
          if (schema.type !== 'string' || typeof schema.const !== 'string')
            throw new Error('unsupported_action_schema');
          return { type: 'string', const: schema.const };
        case 'Union': {
          keys(schema, ['anyOf'], ['type']);
          if (
            (schema.type !== undefined && schema.type !== 'string') ||
            !Array.isArray(schema.anyOf) ||
            schema.anyOf.length < 2 ||
            schema.anyOf.length > 32
          )
            throw new Error('unsupported_action_union');
          const values = schema.anyOf.map((member) => {
            if (Reflect.get(record(member), KIND) !== 'Literal')
              throw new Error('unsupported_action_union');
            return visit(member, depth + 1).const;
          });
          if (new Set(values).size !== values.length)
            throw new Error('unsupported_action_union');
          return { type: 'string', enum: values };
        }
        default:
          throw new Error('unsupported_action_schema');
      }
    };
    return new JsonDocument(
      JSON.stringify({ $schema: DIALECT, $id: uri, ...visit(this.#value, 0) }),
    );
  }
}

function record(value: unknown): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('unsupported_action_schema');
  return value as RecordValue;
}

function keys(
  value: RecordValue,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some(
      (key) => !required.includes(key) && !optional.includes(key),
    )
  )
    throw new Error('unsupported_action_schema_metadata');
}
