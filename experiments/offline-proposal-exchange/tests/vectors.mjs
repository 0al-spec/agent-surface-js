import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  CanonicalObjectHash,
  JsonDocument,
  OfflineSchemaResources,
} from '@0al/agent-surface';
import { OfflineProposalExchange } from '@0al/offline-proposal-exchange-experiment';
import { fixture, hash, json, OTHER_HASH } from './fixtures.mjs';

const calcu = fixture();
const greeting = fixture('greeting');
const prepare = (
  vector = calcu,
  request = vector.request,
  input = vector.inputSchema,
  output = vector.outputSchema,
  requestBytes = 8192,
  resultBytes = 8192,
) =>
  new OfflineProposalExchange(
    request instanceof JsonDocument ? request : json(request),
    input,
    output,
    requestBytes,
    resultBytes,
  ).prepare();
const changed = (value, mutate) => {
  const copy = structuredClone(value);
  mutate(copy.payload, copy);
  return copy;
};
const rejectRequest = (mutate, error) =>
  assert.throws(() => prepare(calcu, changed(calcu.request, mutate)), error);
const rejectResult = (mutate, error) =>
  assert.throws(
    () => prepare().correlate(json(changed(calcu.response, mutate))),
    error,
  );

for (const [name, vector] of [
  ['Calcu', calcu],
  ['Greeting', greeting],
]) {
  test(`${name}: one generic value preserves selected request/result and awaits evidence`, () => {
    const exchange = prepare(vector);
    assert.deepEqual(exchange.request().parse(), vector.request);
    const pending = exchange.correlate(json(vector.response));
    assert.equal(pending.status, 'evidence_required');
    assert.deepEqual(pending.unverifiedOutput().parse(), vector.output);
    assert.deepEqual(pending.evidenceInputs().parse(), {
      request: vector.request,
      result: vector.response,
      output_hash: hash('action-output', vector.output),
    });
    assert.ok(Object.isFrozen(exchange));
    assert.ok(Object.isFrozen(pending));
  });
}

test('ASCII commitments agree with independently hand-ordered JCS wrapper bytes', () => {
  const digest = (kind, objectBytes) =>
    `sha-256:${createHash('sha256')
      .update(
        `{"domain":"https://github.com/0al-spec/agent-surface/hash/${kind}/v1","object":${objectBytes}}`,
      )
      .digest('base64url')}`;
  assert.equal(
    calcu.request.payload.input_hash,
    digest('action-input', '{"left":240,"operator":"multiply","right":0.15}'),
  );
  assert.equal(
    calcu.request.payload.execution_hash,
    digest(
      'action-execution',
      '{"execution_id":"execution-1","mode":"propose"}',
    ),
  );
  assert.equal(
    prepare().correlate(json(calcu.response)).evidenceInputs().parse()
      .output_hash,
    digest(
      'action-output',
      '{"left":240,"operator":"multiply","result":36,"right":0.15}',
    ),
  );
});

for (const [direction, message, reject] of [
  ['request', calcu.request, rejectRequest],
  ['result', calcu.response, rejectResult],
]) {
  for (const field of Object.keys(message.payload)) {
    test(`${direction}: missing ${field}`, () =>
      reject((payload) => {
        delete payload[field];
      }));
    test(`${direction}: null ${field}`, () =>
      reject((payload) => {
        payload[field] = null;
      }));
  }
  for (const field of ['type', 'payload']) {
    test(`${direction}: missing outer ${field}`, () =>
      reject((_payload, outer) => {
        delete outer[field];
      }));
    test(`${direction}: null outer ${field}`, () =>
      reject((_payload, outer) => {
        outer[field] = null;
      }));
  }
  for (const field of [
    'credential',
    'grant',
    'subject',
    'delegate',
    'audience',
    'identity_evidence_hash',
    'runtime_receipt',
    'receipt',
    'receipt_url',
    'extensions',
    'task_hash',
    'receiptVerified',
    'effects',
    'approval',
    'linked_trace_id',
  ]) {
    test(`${direction}: forbidden control member ${field}`, () =>
      reject((payload) => {
        payload[field] = 'DO_NOT_ECHO_TEST_SECRET';
      }, /proposal_shape_invalid/));
  }
  test(`${direction}: extra outer member`, () =>
    reject((_payload, outer) => {
      outer.extra = true;
    }, /proposal_shape_invalid/));
  test(`${direction}: wrong message type`, () =>
    reject((_payload, outer) => {
      outer.type = 'session.start';
    }, /proposal_message_unsupported/));
  for (const field of ['mode', 'execution_id']) {
    test(`${direction}: missing execution.${field}`, () =>
      reject((payload) => {
        delete payload.execution[field];
      }));
    test(`${direction}: null execution.${field}`, () =>
      reject((payload) => {
        payload.execution[field] = null;
      }));
  }
  for (const mode of [
    'read',
    'dry_run',
    'commit',
    'reserve',
    'compensate',
    'revert',
  ])
    test(`${direction}: unsupported ${mode}`, () =>
      reject((payload) => {
        payload.execution.mode = mode;
      }, /proposal_mode_unsupported/));
  test(`${direction}: persisted propose`, () =>
    reject((payload) => {
      payload.execution.persisted = true;
    }, /proposal_shape_invalid/));
  for (const field of [
    'session_id',
    'grant_id',
    'action_id',
    'idempotency_key',
    ...(direction === 'result' ? ['receipt_id'] : []),
  ]) {
    for (const value of [
      '',
      1,
      {},
      [],
      true,
      'a'.repeat((field === 'idempotency_key' ? 128 : 256) + 1),
    ])
      test(`${direction}: invalid ${field} ${JSON.stringify(value).slice(0, 20)}`, () =>
        reject((payload) => {
          payload[field] = value;
        }, /proposal_identifier_invalid/));
  }
  for (const value of ['', 1, 'x'.repeat(129)])
    test(`${direction}: invalid execution ID ${JSON.stringify(value).slice(0, 15)}`, () =>
      reject((payload) => {
        payload.execution.execution_id = value;
      }, /proposal_identifier_invalid/));
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', true, {}])
    test(`${direction}: invalid generation ${JSON.stringify(value)}`, () =>
      reject((payload) => {
        payload.session_generation = value;
      }, /proposal_generation_invalid/));
  for (const [field, length] of [
    ['trace_id', 32],
    ['span_id', 16],
  ]) {
    for (const value of [
      '0'.repeat(length),
      'A'.repeat(length),
      'a'.repeat(length - 1),
      'a'.repeat(length + 1),
      'z'.repeat(length),
    ])
      test(`${direction}: invalid ${field} ${value}`, () =>
        reject((payload) => {
          payload[field] = value;
        }, /proposal_trace_invalid/));
  }
  const digestFields =
    direction === 'request'
      ? [
          'grant_hash',
          'surface_hash',
          'execution_hash',
          'parent_receipt_hash',
          'input_hash',
        ]
      : ['grant_hash', 'surface_hash', 'execution_hash', 'receipt_hash'];
  for (const field of digestFields) {
    for (const value of [
      'sha-256:',
      `sha-256:${'A'.repeat(43)}=`,
      `sha-256:${'A'.repeat(42)}B`,
      `sha-256:${'+'.repeat(43)}`,
      `SHA-256:${'A'.repeat(43)}`,
    ])
      test(`${direction}: invalid digest ${field} ${value.slice(-8)}`, () =>
        reject((payload) => {
          payload[field] = value;
        }, /proposal_digest_invalid/));
  }
}

for (const [field, value] of Object.entries({
  session_id: 'session-2',
  session_generation: 2,
  grant_id: 'grant-2',
  grant_hash: OTHER_HASH,
  surface_hash: OTHER_HASH,
  action_id: 'other.propose',
  idempotency_key: 'invocation-2',
  trace_id: 'a'.repeat(32),
  execution_hash: OTHER_HASH,
}))
  test(`result correlation: changed ${field}`, () =>
    rejectResult((payload) => {
      payload[field] = value;
    }, /proposal_correlation_mismatch/));

test('changed execution ID cannot hide behind echoed execution_hash', () =>
  rejectResult((payload) => {
    payload.execution.execution_id = 'execution-2';
  }, /proposal_correlation_mismatch/));
test('app cannot echo runtime producer span', () =>
  rejectResult((payload) => {
    payload.span_id = calcu.request.payload.span_id;
  }, /proposal_app_span_required/));
for (const field of ['input_hash', 'execution_hash'])
  test(`request recomputes ${field}`, () =>
    rejectRequest((payload) => {
      payload[field] = OTHER_HASH;
    }, /proposal_request_hash_mismatch/));
test('request cannot substitute input under an old hash', () =>
  rejectRequest((payload) => {
    payload.input.left = 111;
  }, /proposal_request_hash_mismatch/));
test('request cannot substitute execution under an old hash', () =>
  rejectRequest((payload) => {
    payload.execution.execution_id = 'execution-2';
  }, /proposal_request_hash_mismatch/));
for (const result of [
  'failed',
  'pending',
  'denied',
  'authorized_for_forwarding',
])
  test(`unsupported result ${result}`, () =>
    rejectResult((payload) => {
      payload.result = result;
    }, /proposal_result_unsupported/));

test('object order is not identity, including nested input and execution', () => {
  const reorder = (value) =>
    Array.isArray(value)
      ? value.map(reorder)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([key, child]) => [key, reorder(child)]),
          )
        : value;
  const exchange = prepare(greeting, reorder(greeting.request));
  assert.deepEqual(
    exchange
      .correlate(json(reorder(greeting.response)))
      .unverifiedOutput()
      .parse(),
    greeting.output,
  );
});
for (const [name, mutate] of [
  [
    'array order',
    (input) => {
      input.recipients.reverse();
    },
  ],
  [
    'Unicode normalization',
    (input) => {
      input.recipients[1] = 'Zoe\u0308';
    },
  ],
  [
    'exact whitespace',
    (input) => {
      input.style.prefix = 'Hello ';
    },
  ],
])
  test(`input hash distinguishes ${name}`, () => {
    const request = changed(greeting.request, (payload) =>
      mutate(payload.input),
    );
    assert.throws(
      () => prepare(greeting, request),
      /proposal_request_hash_mismatch/,
    );
  });

test('saved request and evidence snapshots cannot be changed by consumer objects', () => {
  const vector = fixture('greeting');
  const original = json(vector.request);
  const candidate = new OfflineProposalExchange(
    original,
    vector.inputSchema,
    vector.outputSchema,
    8192,
    8192,
  );
  vector.request.payload.input.recipients.reverse();
  original.parse().payload.session_id = 'mutation';
  const exchange = candidate.prepare();
  exchange.request().parse().payload.input.recipients.reverse();
  const result = exchange.correlate(json(vector.response));
  result.evidenceInputs().parse().request.payload.session_id = 'mutation';
  result.unverifiedOutput().parse().messages.reverse();
  assert.deepEqual(result.evidenceInputs().parse().request, greeting.request);
  assert.deepEqual(result.unverifiedOutput().parse(), greeting.output);
});

test('schema collaborators only receive owned documents, including re-entry', () => {
  let entered = false;
  let nested;
  let exchange;
  const inputSchema = {
    validate(document) {
      const input = document.parse();
      input.left = 999;
      calcu.inputSchema.validate(document);
    },
  };
  const outputSchema = {
    validate(document) {
      document.parse().result = 999;
      if (!entered) {
        entered = true;
        nested = exchange.correlate(json(calcu.response));
      }
      calcu.outputSchema.validate(document);
    },
  };
  exchange = prepare(calcu, calcu.request, inputSchema, outputSchema);
  const pending = exchange.correlate(json(calcu.response));
  assert.deepEqual(
    pending.evidenceInputs().parse(),
    nested.evidenceInputs().parse(),
  );
  assert.equal(pending.unverifiedOutput().parse().result, 36);
});

for (const limit of [
  0,
  -1,
  0.5,
  Number.MAX_SAFE_INTEGER + 1,
  Infinity,
  NaN,
  '8192',
  undefined,
]) {
  for (const direction of ['request', 'result'])
    test(`${direction}: explicit positive safe byte cap required (${String(limit)})`, () => {
      const candidate = new OfflineProposalExchange(
        json(calcu.request),
        calcu.inputSchema,
        calcu.outputSchema,
        direction === 'request' ? limit : 8192,
        direction === 'result' ? limit : 8192,
      );
      assert.throws(() => candidate.prepare(), /proposal_byte_limit_invalid/);
    });
}

test('limits measure original UTF-8 bytes, not JS string length', () => {
  const request = json(greeting.request);
  const response = json(greeting.response);
  const exchange = prepare(
    greeting,
    request,
    greeting.inputSchema,
    greeting.outputSchema,
    request.utf8ByteLength(),
    response.utf8ByteLength(),
  );
  assert.equal(exchange.correlate(response).status, 'evidence_required');
  assert.throws(
    () =>
      prepare(
        greeting,
        request,
        greeting.inputSchema,
        greeting.outputSchema,
        request.utf8ByteLength() - 1,
      ),
    /json_byte_limit/,
  );
  assert.throws(
    () =>
      prepare(
        greeting,
        request,
        greeting.inputSchema,
        greeting.outputSchema,
        8192,
        response.utf8ByteLength() - 1,
      ).correlate(response),
    /json_byte_limit/,
  );
});

test('re-serialized outbound request cannot grow beyond its byte budget', () => {
  const vector = fixture();
  vector.request.payload.input.left = 1e20;
  vector.request.payload.input_hash = hash(
    'action-input',
    vector.request.payload.input,
  );
  const text = JSON.stringify(vector.request).replace(
    '100000000000000000000',
    '1e20',
  );
  assert.throws(
    () =>
      prepare(
        vector,
        new JsonDocument(text),
        vector.inputSchema,
        vector.outputSchema,
        Buffer.byteLength(text),
      ),
    /json_byte_limit/,
  );
});

const malformed = [
  [
    'duplicate outer member',
    (text) => text.replace('{', '{"type":"action.request",'),
    /duplicate_json_member/,
  ],
  [
    'duplicate correlation',
    (text) =>
      text.replace('"session_id":', '"session_id":"other","session_id":'),
    /duplicate_json_member/,
  ],
  ['negative zero', (text) => text.replace('240', '-0'), /invalid_json_number/],
  [
    'nonfinite number',
    (text) => text.replace('240', '1e400'),
    /invalid_json_number/,
  ],
  [
    'broken Unicode',
    (text) => text.replace('session-1', '\\ud800'),
    /invalid_unicode/,
  ],
  ['truncated JSON', (text) => text.slice(0, -1), /invalid_json/],
  ['trailing comment', (text) => `${text}//comment`, /invalid_json/],
];
for (const [name, transform, error] of malformed) {
  test(`strict request parsing: ${name}`, () =>
    assert.throws(
      () =>
        prepare(
          calcu,
          new JsonDocument(transform(JSON.stringify(calcu.request))),
        ),
      error,
    ));
  test(`strict result parsing: ${name}`, () =>
    assert.throws(
      () =>
        prepare().correlate(
          new JsonDocument(transform(JSON.stringify(calcu.response))),
        ),
      error,
    ));
}
test('duplicate input/output members rejected before schema validation', () => {
  assert.throws(
    () =>
      prepare(
        calcu,
        new JsonDocument(
          JSON.stringify(calcu.request).replace(
            '"left":240',
            '"left":111,"left":240',
          ),
        ),
      ),
    /duplicate_json_member/,
  );
  assert.throws(
    () =>
      prepare().correlate(
        new JsonDocument(
          JSON.stringify(calcu.response).replace(
            '"result":36',
            '"result":999,"result":36',
          ),
        ),
      ),
    /duplicate_json_member/,
  );
});
test('nesting is bounded before recursive schema or hashing', () => {
  const nested = new JsonDocument(`${'['.repeat(257)}0${']'.repeat(257)}`);
  assert.throws(() => prepare(calcu, nested), /json_nesting_limit/);
  assert.throws(() => prepare().correlate(nested), /json_nesting_limit/);
});

test('invalid input is rejected before either commitment hash', (t) => {
  const spy = t.mock.method(CanonicalObjectHash.prototype, 'digest');
  rejectRequest((payload) => {
    payload.input.operator = 'sqrt';
  }, /proposal_input_schema_invalid/);
  assert.equal(spy.mock.callCount(), 0);
});
test('invalid output is rejected before output hashing', (t) => {
  const exchange = prepare();
  const spy = t.mock.method(CanonicalObjectHash.prototype, 'digest');
  const response = changed(calcu.response, (payload) => {
    payload.output.result = '36';
  });
  assert.throws(
    () => exchange.correlate(json(response)),
    /proposal_output_schema_invalid/,
  );
  assert.equal(spy.mock.callCount(), 0);
});
test('missing and null domain values are not silently defaulted', () => {
  rejectRequest((payload) => {
    delete payload.input.right;
  }, /proposal_input_schema_invalid/);
  rejectRequest((payload) => {
    payload.input.right = null;
  }, /proposal_input_schema_invalid/);
  rejectResult((payload) => {
    delete payload.output.result;
  }, /proposal_output_schema_invalid/);
  rejectResult((payload) => {
    payload.output.result = null;
  }, /proposal_output_schema_invalid/);
});

test('domain nullability comes from the selected schema, not the envelope', () => {
  const uri = 'https://example.test/null';
  const schema = new OfflineSchemaResources([
    {
      uri,
      document: json({
        $id: uri,
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'null',
      }),
    },
  ])
    .prepare()
    .resolve(uri);
  const request = changed(calcu.request, (payload) => {
    payload.input = null;
    payload.input_hash = hash('action-input', null);
  });
  const response = changed(calcu.response, (payload) => {
    payload.output = null;
  });
  assert.equal(
    prepare(calcu, request, schema, schema)
      .correlate(json(response))
      .unverifiedOutput()
      .parse(),
    null,
  );
});

test('constructors are inert; schema diagnostics do not disclose collaborator errors', () => {
  const schema = {
    validate() {
      throw new Error('DO_NOT_ECHO_TEST_SECRET');
    },
  };
  const candidate = new OfflineProposalExchange(
    json(calcu.request),
    schema,
    schema,
    8192,
    8192,
  );
  assert.throws(() => candidate.prepare(), {
    message: 'proposal_input_schema_invalid',
  });
  assert.throws(
    () =>
      prepare(calcu, calcu.request, calcu.inputSchema, schema).correlate(
        json(calcu.response),
      ),
    { message: 'proposal_output_schema_invalid' },
  );
  assert.doesNotThrow(
    () =>
      new OfflineProposalExchange(
        new JsonDocument('broken'),
        schema,
        schema,
        -1,
        -1,
      ),
  );
});
test('async validation cannot accidentally masquerade as synchronous success', () => {
  const schema = {
    validate() {
      return Promise.resolve();
    },
  };
  assert.throws(
    () => prepare(calcu, calcu.request, schema),
    /proposal_input_schema_invalid/,
  );
  assert.throws(
    () =>
      prepare(calcu, calcu.request, calcu.inputSchema, schema).correlate(
        json(calcu.response),
      ),
    /proposal_output_schema_invalid/,
  );
});

test('rejected async collaborator errors are contained after synchronous rejection', async () => {
  const schema = {
    async validate() {
      throw new Error('DO_NOT_ECHO_TEST_SECRET');
    },
  };
  assert.throws(() => prepare(calcu, calcu.request, schema), {
    message: 'proposal_input_schema_invalid',
  });
  assert.throws(
    () =>
      prepare(calcu, calcu.request, calcu.inputSchema, schema).correlate(
        json(calcu.response),
      ),
    { message: 'proposal_output_schema_invalid' },
  );
  await new Promise(setImmediate);
});

test('maximum ID lengths and safe generation accepted; strings remain exact', () => {
  const vector = fixture();
  for (const message of [vector.request, vector.response]) {
    for (const field of ['session_id', 'grant_id', 'action_id'])
      message.payload[field] = 'x'.repeat(256);
    message.payload.session_generation = Number.MAX_SAFE_INTEGER;
    message.payload.idempotency_key = 'é'.repeat(128);
    message.payload.execution.execution_id = 'x'.repeat(128);
    message.payload.execution_hash = hash(
      'action-execution',
      message.payload.execution,
    );
  }
  vector.response.payload.receipt_id = 'x'.repeat(256);
  assert.equal(
    prepare(vector).correlate(json(vector.response)).status,
    'evidence_required',
  );
});

test('array order and Unicode remain distinct in output commitments', () => {
  const exchange = prepare(greeting);
  const original = exchange
    .correlate(json(greeting.response))
    .evidenceInputs()
    .parse().output_hash;
  for (const response of [
    changed(greeting.response, (payload) => {
      payload.output.messages.reverse();
    }),
    changed(greeting.response, (payload) => {
      payload.output.messages[1] = 'Hello, Zoe\u0308!';
    }),
  ])
    assert.notEqual(
      exchange.correlate(json(response)).evidenceInputs().parse().output_hash,
      original,
    );
});

test('schema-valid wrong arithmetic is only correlated data, never verified truth', () => {
  const response = changed(calcu.response, (payload) => {
    payload.output.result = 999;
  });
  const pending = prepare().correlate(json(response));
  assert.equal(pending.status, 'evidence_required');
  assert.equal(pending.unverifiedOutput().parse().result, 999);
  for (const member of [
    'verified',
    'accepted',
    'execute',
    'approve',
    'verifyReceipt',
  ])
    assert.equal(member in pending, false);
});
test('receipt references are not complete evidence; even changed well-formed refs remain pending', () => {
  for (const field of ['receipt_id', 'receipt_hash']) {
    const response = changed(calcu.response, (payload) => {
      payload[field] = field === 'receipt_id' ? 'foreign-receipt' : OTHER_HASH;
    });
    const pending = prepare().correlate(json(response));
    assert.equal(pending.status, 'evidence_required');
    assert.equal(
      pending.evidenceInputs().parse().result.payload[field],
      response.payload[field],
    );
  }
});
test('no receipt fetch, logging, execution, retry or mutable completion state', (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('unexpected_fetch');
  });
  const log = t.mock.method(console, 'log', () => {
    throw new Error('unexpected_log');
  });
  const exchange = prepare();
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const pending = exchange.correlate(json(calcu.response));
    assert.equal(pending.status, 'evidence_required');
  }
  assert.throws(() =>
    exchange.correlate(
      json(
        changed(calcu.response, (payload) => {
          payload.receipt_url = 'https://untrusted.invalid/';
        }),
      ),
    ),
  );
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(log.mock.callCount(), 0);
  assert.equal('execute' in exchange, false);
});
