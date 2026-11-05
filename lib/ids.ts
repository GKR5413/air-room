/** Client-safe id helpers (lib/api.ts pulls in server-only code). */
export const isGuestId = (id: string) => id.startsWith('guest-');
