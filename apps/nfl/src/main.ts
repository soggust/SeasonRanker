import { startApp } from '@ranker/engine/start-app';

// Everything starts fresh on every page load: rankings, grades, filters, open cards and the settings
// menu. Clear what older versions of the app saved.
try {
  for (const key of ['qbFilterGroups', 'skillFilterGroups', 'qbHiddenGroups', 'skillHiddenGroups', 'rankerSettings']) {
    localStorage.removeItem(key);
  }
} catch {
  // Storage unavailable: nothing to clear
}

// The app's start: the data, then the app (start-app.ts)
startApp();
