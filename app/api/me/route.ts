import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { body } from '@/lib/api';

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const { data, error } = await admin.from('profiles').select('*').eq('id', u.id).single();
  if (error) fail(500, 'Could not load profile');
  return { profile: data };
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await body(req);
  const name = typeof b.display_name === 'string' ? b.display_name.trim() : '';
  if (!name || name.length > 50) fail(400, 'display_name is required (1-50 characters)');
  const updates: Record<string, unknown> = { display_name: name };
  if ('username' in b) {
    const username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
    if (!/^[a-z0-9_]{3,24}$/.test(username)) fail(400, 'Username must be 3–24 letters, numbers or underscores');
    updates.username = username;
  }
  if ('avatar_url' in b) {
    if (b.avatar_url !== null && (typeof b.avatar_url !== 'string' || b.avatar_url.length > 700000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(b.avatar_url)))
      fail(400, 'Choose a PNG, JPEG or WebP photo under 500 KB');
    updates.avatar_url = b.avatar_url;
  }
  const { data, error } = await admin.from('profiles').update(updates).eq('id', u.id).select('*').single();
  if (error?.code === '23505') fail(409, 'That username is already taken');
  if (error) fail(500, 'Could not save profile');
  return { profile: data };
});
