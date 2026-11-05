import { admin } from './supabase-admin';
import { isUuid } from './api';

export type PublicProfile = { id: string; display_name: string; username: string | null; avatar_url: string | null };

/** Find a profile by user id or @username. Returns null when there is no such person. */
export async function findProfile(raw: string): Promise<PublicProfile | null> {
  const key = decodeURIComponent(raw).replace(/^@/, '').toLowerCase();
  const column = isUuid(key) ? 'id' : /^[a-z0-9_]{1,24}$/.test(key) ? 'username' : null;
  if (!column) return null;
  const { data, error } = await admin.from('profiles').select('id, display_name, username, avatar_url').eq(column, key).maybeSingle();
  if (error) throw new Error('Could not load profile');
  return (data as PublicProfile | null) ?? null;
}
