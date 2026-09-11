import empty from './schemas/empty-object.schema.json' with { type: 'json' };
import goodbye from './schemas/goodbye-result.schema.json' with {
  type: 'json',
};
import hello from './schemas/hello-result.schema.json' with { type: 'json' };
import version from './schemas/version-result.schema.json' with {
  type: 'json',
};

export const schemaIds = {
  empty: empty.$id,
  goodbye: goodbye.$id,
  hello: hello.$id,
  version: version.$id,
} as const;

// An offline resolver only: these reserved URLs are never fetched.
export const schemas: ReadonlyMap<string, object> = new Map([
  [empty.$id, empty],
  [goodbye.$id, goodbye],
  [hello.$id, hello],
  [version.$id, version],
]);
