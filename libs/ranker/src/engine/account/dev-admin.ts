// Staging an admin in development (the account menu's "Stage as admin" checkbox). Development no longer
// counts as admin (features.ts), so to see the Algorithm desk, the CHECK rows or desk notes on localhost
// someone has to hold the real claim; against the Auth emulator the app can set it itself, the way the Admin
// SDK does on the live project (set-admin.mjs): accounts:update with customAttributes, authorized as the
// emulator's "owner". The claim then lands on the next token read, so AccountService reads ADMIN from the
// token as always and firestore.rules see the same claim the UI does. No Angular, no Firebase: unit-tested.

export interface StageAdminTarget {
  projectId: string;
  // the Auth emulator's port (firebase.ts emulatorPorts().auth)
  port: number;
  // the signed-in emulator user's uid
  uid: string;
  admin: boolean;
}

// The switch shows on the dev server with the emulators on, and nowhere else: a production build never has
// it, and against the live project the request would be refused anyway (and must never be sent)
export function showStageAdmin(devMode: boolean, emulators: boolean): boolean {
  return devMode && emulators;
}

// The emulator's privileged accounts:update (the route the Admin SDK's setCustomUserClaims uses), on the
// emulator's host; "Bearer owner" is the token the emulator takes for the project's owner
export function stageAdminRequest({ projectId, port, uid, admin }: StageAdminTarget): { url: string; init: RequestInit } {
  return {
    url: `http://127.0.0.1:${port}/identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:update`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify({ admin }) }),
    },
  };
}

// Sets the claim on the emulator; rejects with the emulator's message when it refuses (the emulators off,
// the port wrong, the user gone)
export async function stageEmulatorAdmin(fetchFn: typeof fetch, target: StageAdminTarget): Promise<void> {
  const { url, init } = stageAdminRequest(target);
  const response = await fetchFn(url, init);
  if (!response.ok) {
    let detail = '';
    try {
      detail = ((await response.json()) as { error?: { message?: string } }).error?.message ?? '';
    } catch {
      // (no JSON body: the status is the message)
    }
    throw new Error(`Auth emulator: ${detail || response.status}`);
  }
}
