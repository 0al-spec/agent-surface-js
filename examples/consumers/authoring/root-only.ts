import * as sdk from '@0al/agent-surface';

new sdk.JsonDocument('{}').parse();
// @ts-expect-error authoring is opt-in and must not leak into the base export
void sdk.OfflineActionInventory;
if ('OfflineActionInventory' in sdk)
  throw new Error('authoring_leaked_into_base');
console.log('packed root-only consumer passed without TypeBox');
