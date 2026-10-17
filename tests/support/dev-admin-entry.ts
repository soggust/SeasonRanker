// The feature gate (libs/ranker/src/engine/account/features.ts: Angular's signal and isDevMode, which bundle
// fine under Node, where isDevMode() is true as on the dev server) and the dev-only admin staging
// (dev-admin.ts: no Angular, no Firebase), bundled for dev-admin.test.mjs
export * from '../../libs/ranker/src/engine/account/features';
export * from '../../libs/ranker/src/engine/account/dev-admin';
export { isDevMode } from '@angular/core';
