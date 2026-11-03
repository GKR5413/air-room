import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { body } from '@/lib/api';

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const { data } = await admin.from('profiles').select('*').eq('id', u.id).single();
  return { profile: data };
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await body(req);
  const name = typeof b.display_name === 'string' ? b.display_name.trim() : '';
  if (!name || name.length > 50) fail(400, 'display_name is required (1-50 characters)');
  const { data, error } = await admin.from('profiles').update({ display_name: name }).eq('id', u.id).select('*').single();
  if (error) fail(500, error.message);
  return { profile: data };
});
