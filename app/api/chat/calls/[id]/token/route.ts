import { route, requireUser, fail } from '@/lib/auth';
import { callView, loadCall, requireParticipant, settleCall } from '@/lib/chat';
import { mintCallToken } from '@/lib/livekit';

/**
 * Permission to join this call's audio/video room. The caller may join while it rings;
 * the person being called only after they have answered.
 */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireUser(req);
  const call = await settleCall(await loadCall((await params).id));
  requireParticipant(call, u.id);
  const open = call.status === 'accepted' || (call.status === 'ringing' && call.caller_id === u.id);
  if (!open) fail(410, 'This call has ended');
  const token = await mintCallToken({ callId: call.id, identity: u.id, name: u.name });
  return { token, url: process.env.NEXT_PUBLIC_LIVEKIT_URL, call: await callView(call, u.id) };
});
