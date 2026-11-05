import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase-admin';
import { route, getUser } from '@/lib/auth';
import { findProfile } from '@/lib/profile-lookup';
import { avatarUrl } from '@/lib/avatar';

/** Anyone can view a profile. Follow state is included when the viewer is signed in. */
export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const p = await findProfile(id);
  if (!p) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const viewer = await getUser(req);
  const other = !!viewer && viewer.id !== p.id;
  const [followers, following, mine, theirs] = await Promise.all([
    admin.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', p.id),
    admin.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', p.id),
    other ? admin.from('follows').select('follower_id').eq('follower_id', viewer!.id).eq('followee_id', p.id).maybeSingle() : Promise.resolve({ data: null }),
    other ? admin.from('follows').select('follower_id').eq('follower_id', p.id).eq('followee_id', viewer!.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    id: p.id, display_name: p.display_name, username: p.username, avatar_url: avatarUrl(p.id, p.avatar_url),
    followers: followers.count ?? 0, following: following.count ?? 0,
    isMe: viewer?.id === p.id, signedIn: !!viewer,
    isFollowing: !!mine.data, followsYou: !!theirs.data,
  };
});
