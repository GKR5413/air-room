'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { Mic, MicOff } from 'lucide-react';
import type { RoomState } from '@/lib/types';
import { plural } from '@/lib/format';
import Avatar from './Avatar';
import type { Conn, RoomActions } from './RoomView';
import { useConfirm } from './Providers';

const STATUS: Partial<Record<Conn, string>> = {
  connecting: 'Connecting…', reconnecting: 'Reconnecting…', blocked: 'Tap to enable audio',
  mic: 'Microphone unavailable', closed: 'Disconnected',
};

/** Compact "you're still in this room" bar shown on every page except the room itself. */
export default function MiniRoom({ slug, state, status, micOn, actions }: {
  slug: string;
  state: RoomState | null;
  status: Conn;
  micOn: boolean;
  actions: RoomActions;
}) {
  const confirm = useConfirm();
  const me = state?.me;
  const isHost = me?.role === 'host';
  const onStage = !!me && me.role !== 'listener';
  const stage = state?.stage ?? [];
  const talking = stage.filter(m => m.speaking && m.id !== me?.id);
  const title = state?.room.title ?? 'Live room';
  const faces = stage.slice(0, 2);
  const more = Math.max(0, stage.length + (state?.audienceCount ?? 0) - faces.length);

  useEffect(() => {
    document.body.dataset.mini = '1';
    return () => { delete document.body.dataset.mini; };
  }, []);

  const line = STATUS[status]
    ?? (talking.length
      ? `${talking[0].name}${talking.length > 1 ? ` +${talking.length - 1}` : ''} speaking`
      : state ? `${plural(state.audienceCount, 'listener')} · ${stage.length} on stage` : 'Listening');

  async function leave() {
    if (!isHost) return actions.leave();
    if (await confirm({
      title: 'Leave your room?',
      description: stage.some(p => p.id !== me?.id) ? 'The room keeps running while someone remains on the panel. The next speaker becomes moderator if needed.' : 'You’re the last person on the panel. Leaving ends the room for everyone immediately.',
      confirmLabel: stage.some(p => p.id !== me?.id) ? 'Leave room running' : 'Leave and end room',
    })) await actions.hostLeave('auto');
  }

  return (
    <aside className="mini" aria-label="Your current room">
      <Link href={`/r/${slug}`} className="mini-main" aria-label={`Return to ${title}`}>
        <span className="mini-faces" aria-hidden="true">
          {faces.map(f => <Avatar key={f.id} className="mini-face" name={f.name} src={f.avatar_url} size={40} />)}
          {more > 0 && <span className="mini-more">+{more}</span>}
        </span>
        <span className="mini-text">
          <b>{title}</b>
          <small className={status === 'listening' ? '' : 'warn'} aria-live="polite">{line}</small>
        </span>
      </Link>

      {onStage && (
        <button
          type="button" className={`icon-btn round mini-mic${micOn ? ' is-live' : ''}`}
          onClick={() => actions.setMic(!micOn)} aria-pressed={micOn} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
          title={micOn ? 'Mute' : 'Unmute'}
        >
          {micOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
      )}
      <button type="button" className="leave-pill mini-leave" onClick={leave} aria-label="Leave room" title="Leave room">
        <span aria-hidden="true">✌️</span>leave
      </button>
    </aside>
  );
}
