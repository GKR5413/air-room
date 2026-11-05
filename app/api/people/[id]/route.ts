import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { body, isUuid } from '@/lib/api';

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireUser(req);
  const { id } = await params;
  if (!isUuid(id) || id === u.id) fail(400, 'Choose another user');
  const { action } = await body(req);
  if (!['follow', 'unfollow', 'remove_follower'].includes(action)) fail(400, 'Invalid action');
  if (action === 'follow') {
    const { data, error } = await admin.from('profiles').select('id').eq('id', id).maybeSingle();
    if (error) fail(500, 'Could not find user');
    if (!data) fail(404, 'User not found');
  }
  const result = action === 'follow'
    ? await admin.from('follows').upsert({ follower_id: u.id, followee_id: id }, { onConflict: 'follower_id,followee_id', ignoreDuplicates: true })
    : await admin.from('follows').delete().eq('follower_id', action === 'remove_follower' ? id : u.id).eq('followee_id', action === 'remove_follower' ? u.id : id);
  if (result.error) fail(500, 'Could not update connection');
  return { ok: true };
});
