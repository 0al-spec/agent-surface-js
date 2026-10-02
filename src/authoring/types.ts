import type { Static, TSchema } from '@sinclair/typebox';
import type { JsonDocument } from '../json-document.js';
import type { OfflineSchemaResource } from '../offline-schema-resources.js';

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

/** Publisher assertions only. No field grants permission to invoke anything. */
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

/** TSchema is a type boundary, not evidence of supported runtime grammar. */
export interface ActionDeclaration<
  Input extends TSchema = TSchema,
  Output extends TSchema = TSchema,
> {
  readonly action: ActionWireMetadata;
  readonly input: Input;
  readonly output: Output;
}

export type ActionInput<Action extends ActionDeclaration> = Static<
  Action['input']
>;
export type ActionOutput<Action extends ActionDeclaration> = Static<
  Action['output']
>;

/** Qualified descriptors and shape checks; no handler or authority handle. */
export interface PreparedActionInventory {
  readonly actionDocuments: readonly JsonDocument[];
  readonly schemaResources: readonly OfflineSchemaResource[];
  validateInput(actionId: string, document: JsonDocument): void;
  validateOutput(actionId: string, document: JsonDocument): void;
}
