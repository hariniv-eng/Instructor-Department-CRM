// Tracks whether someone picked "Manager view" on the /access chooser, for
// this browser tab's session (2026-09: Manager has no login of its own
// anymore — see App.tsx's Guard and the backend's routes/index.ts). Kept as
// plain sessionStorage reads/writes rather than React state so it survives
// a full page reload within the same tab (matching "pick once per visit"),
// but resets on a new tab/window, matching "opening the application" fresh.
// Wrapped in try/catch: sessionStorage can throw in private-browsing modes
// or when third-party storage is blocked, and this should degrade to
// "always show the chooser" rather than crash the app.

const VIEW_MODE_KEY = 'fcc-view-mode';

export function isManagerViewChosen(): boolean {
  try {
    return sessionStorage.getItem(VIEW_MODE_KEY) === 'manager';
  } catch {
    return false;
  }
}

export function chooseManagerView(): void {
  try {
    sessionStorage.setItem(VIEW_MODE_KEY, 'manager');
  } catch {
    // Ignore — worst case, the chooser reappears on the next navigation.
  }
}

export function clearViewMode(): void {
  try {
    sessionStorage.removeItem(VIEW_MODE_KEY);
  } catch {
    // Ignore.
  }
}
