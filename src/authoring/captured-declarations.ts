const INVALID = Symbol('invalid_authoring_capture');
const MAX_VALUES = 4_096;
const MAX_DEPTH = 64;
const MAX_TEXT_UNITS = 1_000_000;

/** Bounded own-data capture, with failure reported only during preparation. */
export class CapturedDeclarations {
  readonly #value: unknown;

  constructor(value: unknown) {
    this.#value = capture(value);
  }

  declarations(): readonly unknown[] {
    if (!Array.isArray(this.#value))
      throw new Error('authoring_capture_invalid');
    return this.#value;
  }
}

// Capture is the only constructor work: no schema parsing, hashing, I/O or
// callbacks. Developer objects are not a sandbox against Proxy traps.
function capture(value: unknown): unknown {
  let values = 0;
  let textUnits = 0;
  const active = new WeakSet<object>();
  const visit = (current: unknown, depth: number): unknown => {
    if (++values > MAX_VALUES || depth > MAX_DEPTH) throw INVALID;
    if (typeof current === 'string') {
      textUnits += current.length;
      if (textUnits > MAX_TEXT_UNITS) throw INVALID;
      return current;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || Object.is(current, -0)) throw INVALID;
      return current;
    }
    if (current === null || typeof current === 'boolean') return current;
    if (typeof current !== 'object' || active.has(current)) throw INVALID;
    const array = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (
      array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      throw INVALID;
    if (array && current.length > MAX_VALUES - values) throw INVALID;
    const keys = Reflect.ownKeys(current);
    if (keys.length > MAX_VALUES - values) throw INVALID;
    if (array && keys.length !== current.length + 1) throw INVALID;
    const copy = array ? new Array(current.length) : Object.create(null);
    active.add(current);
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (
        array &&
        (typeof key !== 'string' ||
          !/^(0|[1-9][0-9]*)$/u.test(key) ||
          Number(key) >= current.length)
      )
        throw INVALID;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor === undefined || !('value' in descriptor)) throw INVALID;
      // Hidden string fields must not disappear during JSON serialization.
      if (typeof key === 'string') {
        if (!descriptor.enumerable) throw INVALID;
        textUnits += key.length;
        if (textUnits > MAX_TEXT_UNITS) throw INVALID;
      }
      Object.defineProperty(copy, key, {
        value: visit(descriptor.value, depth + 1),
        enumerable: descriptor.enumerable ?? false,
      });
    }
    active.delete(current);
    return Object.freeze(copy);
  };
  try {
    return visit(value, 0);
  } catch {
    return INVALID;
  }
}
