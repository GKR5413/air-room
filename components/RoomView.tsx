'use client';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine, ArrowLeft, Check, CircleAlert, Crown, Ellipsis, Flag, Globe, Hand, Headphones, Info,
  Link2, LogOut, Mic, MicOff, Pause, Play, Radio, RefreshCw, Send, ShieldCheck, ShieldOff, Tag, UserMinus,
  Volume2, X,
} from 'lucide-react';
import type { ModAction, Role, RoomState, StageMember } from '@/lib/types';
import { languageName, plural, timeAgo } from '@/lib/format';
import Avatar from './Avatar';
import Modal from './Modal';
import ThemeToggle from './ThemeToggle';
import { useConfirm, useToast } from './Providers';

export type Conn = 'connecting' | 'listening' | 'reconnecting' | 'blocked' | 'mic' | 'closed';

const LABEL: Record<Conn, string> = {
  connecting: 'Connecting', listening: 'Listening', reconnecting: 'Reconnecting',
  blocked: 'Playback blocked', mic: 'Microphone unavailable', closed: 'Disconnected',
};
const TONE: Record<Conn, 'ok' | 'warn' | 'bad'> = {
  connecting: 'warn', listening: 'ok', reconnecting: 'warn', blocked: 'warn', mic: 'bad', closed: 'bad',
};
const ROLE_LABEL: Record<Role, string> = { host: 'Host', moderator: 'Moderator', speaker: 'Speaker', listener: 'Listener' };
const REPORT_REASONS = ['Harassment', 'Hate speech', 'Spam', 'Misinformation', 'Something else'];

export interface RoomActions {
  leave(): void;
  reconnect(): void;
  startAudio(): void;
  setMic(on: boolean): void;
  raiseHand(): void;
  lowerHand(): void;
  acceptInvite(): void;
  declineInvite(): void;
  moderate(action: ModAction, target?: string): void;
  toAudience(id: string): void;
  endRoom(): void;
  hostLeave(mode: 'end' | 'transfer', newHostId?: string): Promise<void>;
  report(reason: string, details: string): Promise<boolean>;
}

export interface RoomViewProps {
  state: RoomState | null;
  status: Conn;
  connError?: string;
  micOn: boolean;
  micEver: boolean;
  speaking: Set<string>;
  /** Set when the server refused us (removed / ended on join). */
  blockedMsg: string;
  actions: RoomActions;
}

export default function RoomView({ state, status, connError, micOn, micEver, speaking, blockedMsg, actions }: RoomViewProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [newHost, setNewHost] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const ended = state?.room.status === 'ended';
  const over = !!blockedMsg || ended;

  // Hide the global site nav while inside a live room.
  useEffect(() => {
    if (over) return;
    document.body.dataset.immersive = '1';
    return () => { delete document.body.dataset.immersive; };
  }, [over]);

  if (over) {
    const removed = /removed/i.test(blockedMsg);
    return (
      <div className="container slim page">
        <div className="card card-pad gate rise">
          <span className="empty-ico">{removed ? <UserMinus size={28} /> : <Radio size={28} />}</span>
          <h1 className="display">{removed ? 'You’ve been removed' : 'That’s a wrap'}</h1>
          <p className="muted" role="alert">{blockedMsg || 'This room has ended. The conversation is over.'}</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={actions.leave}><ArrowLeft size={18} />Back</button>
        </div>
      </div>
    );
  }

  const me = state?.me;
  const role = me?.role;
  const isHost = role === 'host';
  const isMod = isHost || role === 'moderator';
  const onStage = !!role && role !== 'listener';
  const stage = state?.stage ?? [];
  const stageOthers = stage.filter(m => m.id !== me?.id);
  const handsCount = state?.hands.length ?? 0;
  const audience = state?.audienceCount ?? 0;
  const handsOn = !!state?.room.hands_enabled;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
      toast('Link copied. Share it anywhere.', 'ok');
    } catch { toast('Couldn’t copy the link', 'error'); }
  }

  async function submitReport(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const ok = await actions.report(reason, details);
    setSending(false);
    if (ok) { setReportOpen(false); setReason(''); setDetails(''); }
  }

  async function endRoom() {
    if (await confirm({
      title: 'End this room for everyone?',
      description: 'Everyone will be disconnected and the conversation is over. This can’t be undone.',
      confirmLabel: 'End room', tone: 'danger',
    })) actions.endRoom();
  }

  const panel = (
    <RoomPanel
      state={state} isHost={isHost} isMod={isMod} onCopy={copyLink} copied={copied}
      onEnd={endRoom} actions={actions}
    />
  );

  return (
    <div className="room">
      <header className="room-top">
        <div className="container room-top-inner">
          <button
            type="button" className="btn btn-ghost btn-icon room-back"
            onClick={() => (isHost ? setLeaving(true) : actions.leave())} aria-label="Leave room"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="room-heading">
            <div className="room-kicker">
              <span className="live-badge">Live</span>
              <span className={`conn conn-${TONE[status]}`} role="status">
                {status === 'connecting' || status === 'reconnecting' ? <span className="spinner" /> : <i className="conn-dot" />}
                {LABEL[status]}
              </span>
            </div>
            <h1 className="room-title">{state?.room.title ?? 'Room'}</h1>
            <p className="room-meta">
              <span>Host <b>{state?.room.host_name}</b></span>
              {state?.room.topic && <><i aria-hidden="true">·</i><span>{state.room.topic}</span></>}
              {state?.room.language && <><i aria-hidden="true">·</i><span>{languageName(state.room.language)}</span></>}
            </p>
          </div>

          <div className="room-top-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={copyLink}>
              {copied ? <Check size={15} /> : <Link2 size={15} />}
              <span className="hide-sm">{copied ? 'Link copied' : 'Copy link'}</span>
            </button>
            {me && !me.isGuest && (
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setReportOpen(true)} aria-label="Report room" title="Report room">
                <Flag size={16} />
              </button>
            )}
            <span className="hide-sm"><ThemeToggle /></span>
          </div>
        </div>
      </header>

      <div className="container room-body">
        <main className="room-main">
          {/* ── Banners ───────────────────────────────────── */}
          {me?.invitationId && (
            <div className="invite-banner rise" role="group" aria-label="Stage invitation">
              <span className="invite-ico"><Mic size={22} /></span>
              <div className="invite-text">
                <strong>You have been invited to join the stage.</strong>
                <span>You’ll join muted. Switch your microphone on when you’re ready.</span>
              </div>
              <div className="invite-actions">
                <button type="button" className="btn btn-primary" onClick={actions.acceptInvite}>Join stage</button>
                <button type="button" className="btn btn-ghost" onClick={actions.declineInvite}>Decline</button>
              </div>
            </div>
          )}

          {status === 'blocked' && (
            <div className="alert alert-info banner" role="alert">
              <Volume2 />
              <div style={{ flex: 1 }}>
                <strong>Your browser is blocking audio</strong>
                <div className="muted">Tap below to start hearing the room.</div>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={actions.startAudio}>Play audio</button>
            </div>
          )}
          {status === 'mic' && (
            <div className="alert alert-error banner" role="alert">
              <MicOff />
              <div>
                <strong>Microphone unavailable</strong>
                <div className="muted">Allow microphone access for this site in your browser settings, then try again.</div>
              </div>
            </div>
          )}
          {status === 'closed' && (
            <div className="alert alert-error banner" role="alert">
              <CircleAlert />
              <div style={{ flex: 1 }}>
                <strong>You’re disconnected</strong>
                <div className="muted">{connError || 'The audio connection was lost.'}</div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={actions.reconnect}><RefreshCw size={14} />Reconnect</button>
            </div>
          )}

          {/* ── Stage ─────────────────────────────────────── */}
          <section aria-labelledby="stage-h">
            <div className="sec-head">
              <h2 id="stage-h">Stage</h2>
              <span className="count">{stage.length}</span>
            </div>
            {stage.length === 0 ? (
              <div className="stage-empty"><Mic size={20} /><span>{state ? 'The stage is empty right now.' : 'Tuning in…'}</span></div>
            ) : (
              <ul className="stage">
                {stage.map((m, i) => (
                  <StageTile
                    key={m.id} m={m} index={i} isMe={m.id === me?.id}
                    isSpeaking={(speaking.has(m.id) || m.speaking) && !m.muted}
                    canManage={isMod && m.id !== me?.id && m.role !== 'host'}
                    isHost={isHost} actions={actions} confirm={confirm}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* ── Audience ──────────────────────────────────── */}
          <section aria-labelledby="aud-h" className="audience">
            <div className="sec-head">
              <h2 id="aud-h">Audience</h2>
              <span className="count">{audience}</span>
            </div>
            {audience === 0 ? (
              <div className="stage-empty"><Headphones size={20} /><span>No one is listening yet. Share the link to bring people in.</span></div>
            ) : (
              <div className="aud-row">
                <div className="aud-stack" aria-hidden="true">
                  {Array.from({ length: Math.min(audience, 14) }, (_, i) => (
                    <span key={i} className="aud-dot" style={{ '--h1': (i * 53 + 20) % 360, '--h2': (i * 53 + 72) % 360, '--i': i } as CSSProperties} />
                  ))}
                  {audience > 14 && <span className="aud-more">+{audience - 14}</span>}
                </div>
                <p className="muted">{plural(audience, 'person', 'people')} listening in</p>
              </div>
            )}
          </section>
        </main>

        <aside className="room-side" aria-label="Room details">{panel}</aside>
      </div>

      {/* ── Control dock ─────────────────────────────────── */}
      <div className="dock" role="toolbar" aria-label="Room controls">
        {onStage && (
          !micEver ? (
            <button type="button" className="btn btn-primary dock-mic" onClick={() => actions.setMic(true)} aria-label="Enable microphone">
              <Mic size={20} /><span>Enable mic<span className="hide-xs">rophone</span></span>
            </button>
          ) : micOn ? (
            <button type="button" className="btn dock-mic is-live" onClick={() => actions.setMic(false)}>
              <span className="eq" aria-hidden="true"><i /><i /><i /><i /></span><span>Mute</span>
            </button>
          ) : (
            <button type="button" className="btn dock-mic is-muted" onClick={() => actions.setMic(true)}>
              <MicOff size={20} /><span>Unmute</span>
            </button>
          )
        )}

        {me && !onStage && !me.isGuest && handsOn && (
          me.handPending ? (
            <button type="button" className="btn dock-hand is-raised" onClick={actions.lowerHand}>
              <Hand size={20} /><span>Lower hand</span>
            </button>
          ) : (
            <button type="button" className="btn btn-primary dock-hand" onClick={actions.raiseHand}>
              <Hand size={20} /><span>Raise hand</span>
            </button>
          )
        )}
        {me && !onStage && me.isGuest && (
          <Link href="/login" className="btn btn-primary dock-hand"><Hand size={20} /><span>Sign in to raise your hand</span></Link>
        )}
        {me && !onStage && !me.isGuest && !handsOn && (
          <span className="dock-note"><Pause size={16} />Hand raising is paused</span>
        )}

        {onStage && !isHost && (
          <button type="button" className="btn btn-outline dock-sec" onClick={() => me && actions.toAudience(me.id)} aria-label="Move to audience">
            <ArrowDownToLine size={18} /><span className="hide-sm">Move to audience</span>
          </button>
        )}

        <button type="button" className="btn btn-outline dock-sec dock-details" onClick={() => setPanelOpen(true)} aria-label="Room details">
          <Info size={18} />
          {isMod && handsCount > 0 && <b className="dock-badge">{handsCount}</b>}
        </button>

        <span className="dock-sep" aria-hidden="true" />

        <button
          type="button" className="btn btn-danger dock-leave"
          onClick={() => (isHost ? setLeaving(true) : actions.leave())} aria-label="Leave"
        >
          <LogOut size={18} /><span className="hide-sm">Leave</span>
        </button>
      </div>

      {/* ── Mobile details sheet ─────────────────────────── */}
      <Modal open={panelOpen} onClose={() => setPanelOpen(false)} title="Room details" icon={<Info size={22} />} wide>
        {panel}
      </Modal>

      {/* ── Report ───────────────────────────────────────── */}
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Report this room" description="Tell us what’s wrong. Our team reviews every report." icon={<Flag size={22} />} tone="danger">
        <form onSubmit={submitReport} className="stack" id="report-form">
          <div className="suggest" role="group" aria-label="Common reasons" style={{ marginTop: 0 }}>
            {REPORT_REASONS.map(r => (
              <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>
            ))}
          </div>
          <div className="field">
            <label className="label" htmlFor="rr">Reason</label>
            <input id="rr" className="input" value={reason} onChange={e => setReason(e.target.value)} required placeholder="What happened?" />
          </div>
          <div className="field">
            <label className="label" htmlFor="rd">Details <span className="opt">Optional</span></label>
            <textarea id="rd" className="textarea" value={details} onChange={e => setDetails(e.target.value)} placeholder="Anything that helps us understand." />
          </div>
          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-outline" onClick={() => setReportOpen(false)}>Cancel report</button>
            <button type="submit" className="btn btn-primary" disabled={sending || !reason.trim()}>
              {sending ? <span className="spinner" /> : <><Send size={16} />Send report</>}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Host leave ───────────────────────────────────── */}
      <Modal
        open={leaving && isHost} onClose={() => setLeaving(false)}
        title="You’re the host" description="You are the host. Choose how to leave." icon={<Crown size={22} />}
      >
        <div className="field">
          <label className="label" htmlFor="nh">Hand over to</label>
          <select id="nh" className="select" value={newHost} onChange={e => setNewHost(e.target.value)}>
            <option value="">Select from stage</option>
            {stageOthers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {stageOthers.length === 0 && <span className="hint">Invite someone to the stage first to hand over hosting.</span>}
        </div>
        <button type="button" className="btn btn-primary btn-block" disabled={!newHost} onClick={() => actions.hostLeave('transfer', newHost)}>
          Transfer and leave
        </button>
        <div className="or"><span>or</span></div>
        <button type="button" className="btn btn-danger btn-block" onClick={() => actions.hostLeave('end')}>End for everyone</button>
        <button type="button" className="btn btn-ghost btn-block" onClick={() => setLeaving(false)}>Cancel</button>
      </Modal>
    </div>
  );
}

/* ── Stage tile ──────────────────────────────────────────── */
function StageTile({
  m, index, isMe, isSpeaking, canManage, isHost, actions, confirm,
}: {
  m: StageMember; index: number; isMe: boolean; isSpeaking: boolean; canManage: boolean; isHost: boolean;
  actions: RoomActions; confirm: ReturnType<typeof useConfirm>;
}) {
  const canAct = isHost || m.role !== 'moderator'; // moderators can’t act on other moderators
  return (
    <li className={`tile${isSpeaking ? ' speaking' : ''}${m.muted ? ' is-muted' : ''}`} style={{ '--d': index } as CSSProperties}>
      <div className="tile-avatar">
        <span className="pulse p1" /><span className="pulse p2" />
        <Avatar name={m.name} size={104} />
        {m.role === 'host' && <span className="tile-badge role" title="Host"><Crown size={14} /></span>}
        {m.role === 'moderator' && <span className="tile-badge role mod" title="Moderator"><ShieldCheck size={14} /></span>}
        <span className={`tile-badge mic ${m.muted ? 'off' : 'on'}`} aria-hidden="true">
          {m.muted ? <MicOff size={13} /> : <Mic size={13} />}
        </span>
      </div>
      <div className="tile-name" title={m.name}><span className="tile-name-text">{m.name}</span>{isMe && <span className="you">You</span>}</div>
      <div className="tile-role">
        {ROLE_LABEL[m.role]}
        <span className="sr-only">, {m.muted ? 'muted' : 'unmuted'}{isSpeaking ? ', speaking' : ''}</span>
      </div>

      {canManage && canAct && (
        <MemberMenu m={m} isHost={isHost} actions={actions} confirm={confirm} />
      )}
    </li>
  );
}

function MemberMenu({ m, isHost, actions, confirm }: { m: StageMember; isHost: boolean; actions: RoomActions; confirm: ReturnType<typeof useConfirm> }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  const item = (label: string, aria: string, icon: ReactNode, fn: () => void, danger = false) => (
    <button type="button" role="menuitem" className={`menu-item${danger ? ' danger' : ''}`} aria-label={aria} onClick={() => { setOpen(false); fn(); }}>
      {icon}{label}
    </button>
  );

  return (
    <div className="tile-menu" ref={wrap}>
      <button
        type="button" className="btn btn-ghost btn-icon btn-sm tile-more" aria-haspopup="menu" aria-expanded={open}
        aria-label={`Actions for ${m.name}`} onClick={() => setOpen(o => !o)}
      >
        <Ellipsis size={18} />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label={`Actions for ${m.name}`}>
          {item('Mute', `Mute ${m.name}`, <MicOff />, () => actions.moderate('mute', m.id))}
          {item('Move to audience', `Move ${m.name} to audience`, <ArrowDownToLine />, () => actions.moderate('to_audience', m.id))}
          {isHost && <div className="menu-sep" />}
          {isHost && m.role !== 'moderator' && item('Appoint moderator', `Appoint ${m.name} as moderator`, <ShieldCheck />, () => actions.moderate('appoint_mod', m.id))}
          {isHost && m.role === 'moderator' && item('Remove moderator', `Remove ${m.name} as moderator`, <ShieldOff />, () => actions.moderate('remove_mod', m.id))}
          {isHost && item('Make host', `Make ${m.name} host`, <Crown />, async () => {
            if (await confirm({ title: `Make ${m.name} the host?`, description: 'You’ll become a moderator. They get full control of the room.', confirmLabel: 'Transfer host' })) actions.moderate('transfer_host', m.id);
          })}
          <div className="menu-sep" />
          {item('Remove from room', `Remove ${m.name} from room`, <UserMinus />, async () => {
            if (await confirm({ title: `Remove ${m.name} from the room?`, description: 'They’ll be disconnected and won’t be able to rejoin.', confirmLabel: 'Remove', tone: 'danger' })) actions.moderate('remove', m.id);
          }, true)}
        </div>
      )}
    </div>
  );
}

/* ── Side panel (desktop aside / mobile sheet) ───────────── */
function RoomPanel({
  state, isHost, isMod, onCopy, copied, onEnd, actions,
}: {
  state: RoomState | null; isHost: boolean; isMod: boolean; onCopy: () => void; copied: boolean; onEnd: () => void; actions: RoomActions;
}) {
  const room = state?.room;
  const hands = state?.hands ?? [];
  return (
    <div className="panel">
      <section className="panel-sec">
        <h2 className="panel-h">About</h2>
        {room?.description && <p className="panel-desc">{room.description}</p>}
        <div className="panel-chips">
          {room?.topic && <span className="chip"><Tag aria-hidden="true" />{room.topic}</span>}
          {room?.language && <span className="chip"><Globe aria-hidden="true" />{languageName(room.language)}</span>}
          {room && <span className="chip">{room.visibility === 'public' ? 'Public' : 'Unlisted'}</span>}
        </div>
        <button type="button" className="btn btn-outline btn-block" onClick={onCopy}>
          {copied ? <><Check size={16} />Link copied</> : <><Link2 size={16} />Copy invite link</>}
        </button>
      </section>

      {isMod && (
        <section className="panel-sec">
          <div className="panel-h-row">
            <h2 className="panel-h">Hand queue <span className="count">{hands.length}</span></h2>
            {room?.hands_enabled
              ? <button type="button" className="btn btn-outline btn-sm" onClick={() => actions.moderate('pause_hands')}><Pause size={14} />Pause hand raising</button>
              : <button type="button" className="btn btn-primary btn-sm" onClick={() => actions.moderate('resume_hands')}><Play size={14} />Resume hand raising</button>}
          </div>

          {hands.length === 0 ? (
            <div className="queue-empty"><Hand size={20} /><span>No raised hands.</span></div>
          ) : (
            <ul className="queue">
              {hands.map(h => (
                <li key={h.userId} className="queue-item">
                  <Avatar name={h.name} size={38} />
                  <div className="queue-who">
                    <strong>{h.name}</strong>
                    <span>{timeAgo(h.createdAt)}</span>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => actions.moderate('invite', h.userId)} aria-label={`Invite ${h.name} to stage`}>Invite</button>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => actions.moderate('dismiss_hand', h.userId)} aria-label={`Dismiss ${h.name}`}><X size={16} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isHost && (
        <section className="panel-sec">
          <h2 className="panel-h">Host controls</h2>
          <button type="button" className="btn btn-danger btn-block" onClick={onEnd}><Radio size={16} />End room</button>
        </section>
      )}
    </div>
  );
}
