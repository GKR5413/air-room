import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase-admin';
import { getUser } from '@/lib/auth';
import { isUuid } from '@/lib/api';

/** A voice message's audio. Only the two people in that conversation can fetch it. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getUser(req);
  if (!me || !isUuid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: m } = await admin.from('messages').select('audio, kind, conversation_id').eq('id', id).maybeSingle();
  if (!m || m.kind !== 'voice' || !m.audio) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: c } = await admin.from('conversations').select('user_a, user_b').eq('id', m.conversation_id).maybeSingle();
  if (!c || (c.user_a !== me.id && c.user_b !== me.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = /^data:(audio\/[a-z0-9.+-]+(?:;codecs=[a-z0-9.,+-]+)?);base64,(.+)$/i.exec(m.audio);
  if (!parsed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(parsed[2], 'base64')), {
    headers: { 'Content-Type': parsed[1], 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
}
