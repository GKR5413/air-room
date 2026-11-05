import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase-admin';
import { route, getUser } from '@/lib/auth';
import { findProfile } from '@/lib/profile-lookup';
import { avatarUrl } from '@/lib/avatar';

const LIMIT = 200;

/** Who follows this person (?type=followers) or who they follow (?type=following). Public. */
export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const p = await findProfile(id);
  if (!p) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const type = req.nextUrl.searchParams.get('type') === 'following' ? 'following' : 'followers';

  const { data: rows, error } = type === 'followers'
    ? await admin.from('follows').select('person:follower_id').eq('followee_id', p.id).order('created_at', { ascending: false }).limit(LIMIT)
    : await admin.from('follows').select('person:followee_id').eq('follower_id', p.id).order('created_at', { ascending: false }).limit(LIMIT);
  if (error) return NextResponse.json({ error: 'Could not load connections' }, { status: 500 });
  const ids = (rows ?? []).map((r: any) => r.person as string);
  if (!ids.length) return { type, people: [] };

  const viewer = await getUser(req);
  const [profiles, mine] = await Promise.all([
    admin.from('profiles').select('id, display_name, username, avatar_url').in('id', ids),
    viewer ? admin.from('follows').select('followee_id').eq('follower_id', viewer.id).in('followee_id', ids) : Promise.resolve({ data: [] as { followee_id: string }[] }),
  ]);
  if (profiles.error) return NextResponse.json({ error: 'Could not load people' }, { status: 500 });
  const byId = new Map((profiles.data ?? []).map((x: any) => [x.id as string, x]));
  const following = new Set((mine.data ?? []).map(x => x.followee_id));
  return {
    type,
    signedIn: !!viewer,
    people: ids.flatMap(pid => {
      const x = byId.get(pid);
      return x ? [{
        id: x.id, display_name: x.display_name, username: x.username, avatar_url: avatarUrl(x.id, x.avatar_url),
        isMe: viewer?.id === x.id, isFollowing: following.has(x.id),
      }] : [];
    }),
  };
});
