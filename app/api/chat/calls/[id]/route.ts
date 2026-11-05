import { route, requireUser, fail } from '@/lib/auth';
import { body } from '@/lib/api';
import { applyCallAction, callView, loadCall, requireParticipant, settleCall } from '@/lib/chat';
import type { CallAction } from '@/lib/chat-core';

type Ctx = { params: Promise<{ id: string }> };
const ACTIONS: CallAction[] = ['accept', 'decline', 'cancel', 'end', 'ping'];

/** Where a call stands. Calls that rang out or lost their connection are closed here. */
export const GET = route<Ctx>(async (req, { params }) => {
  const u = await requireUser(req);
  const call = await loadCall((await params).id);
  requireParticipant(call, u.id);
  return { call: await callView(await settleCall(call), u.id) };
});

/** Answer, decline, cancel, hang up, or send a keep-alive. */
export const POST = route<Ctx>(async (req, { params }) => {
  const u = await requireUser(req);
  const call = await loadCall((await params).id);
  requireParticipant(call, u.id);
  const b = await body(req);
  if (!ACTIONS.includes(b.action)) fail(400, 'Unknown action');
  return { call: await callView(await applyCallAction(call, b.action, u.id), u.id) };
});
