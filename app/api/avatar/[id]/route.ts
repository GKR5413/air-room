import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase-admin';
import { isUuid } from '@/lib/api';
import { parseDataUrl } from '@/lib/avatar';

/** A profile photo as a real, cacheable image. URLs carry a ?v= fingerprint, so they never go stale. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse('Not found', { status: 404 });
  const { data } = await admin.from('profiles').select('avatar_url').eq('id', id).maybeSingle();
  const photo = data?.avatar_url ? parseDataUrl(data.avatar_url) : null;
  if (!photo) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: { 'Content-Type': photo.type, 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
