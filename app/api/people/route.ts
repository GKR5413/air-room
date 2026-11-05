import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase().replace(/^@/, '');
  if (q && !/^[a-z0-9_]{1,24}$/.test(q)) fail(400, 'Search using letters, numbers or underscores');
  const [followers, following] = await Promise.all([
    admin.from('follows').select('follower_id').eq('followee_id', u.id),
    admin.from('follows').select('followee_id').eq('follower_id', u.id),
  ]);
  if (followers.error || following.error) fail(500, 'Could not load connections');
  const followerIds = (followers.data ?? []).map(x => x.follower_id);
  const followingIds = (following.data ?? []).map(x => x.followee_id);
  if (req.nextUrl.searchParams.get('ids')) return { followerIds, followingIds }; // counts and follow state only, no photos
  let query = admin.from('profiles').select('id, display_name, username, avatar_url').neq('id', u.id).order('display_name').limit(100);
  if (q) query = query.like('username', `${q.replace(/_/g, '\\_')}%`);
  else {
    const ids = [...new Set([...followerIds, ...followingIds])];
    if (!ids.length) return { people: [], followerIds, followingIds };
    query = query.in('id', ids);
  }
  const { data, error } = await query;
  if (error) fail(500, 'Could not load people');
  return { people: data, followerIds, followingIds };
});
