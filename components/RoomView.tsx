'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine, ArrowLeft, Asterisk, Check, ChevronDown, CircleAlert, Crown, Ellipsis, Flag, Hand, Headphones, Info,
  Link2, Mic, MicOff, Pause, Play, Plus, Radio, RefreshCw, Send, Share, ShieldCheck, ShieldOff, UserMinus, UserPlus,
  Volume2, X,
} from 'lucide-react';
import { api } from '@/lib/supabase-browser';
import type { ModAction, Person, Role, RoomState, StageMember } from '@/lib/types';
import { timeAgo } from '@/lib/format';
import Avatar from './Avatar';
import Modal from './Modal';
import InviteFriends from './InviteFriends';
import ProfileSheet, { type ProfileTarget } from './ProfileSheet';
import { useConfirm, useToast } from './Providers';

export type Conn = 'connecting' | 'listening' | 'reconnecting' | 'blocked' | 'mic' | 'closed';

const ROLE_LABEL: Record<Role, string> = { host: 'Host', moderator: 'Moderator', speaker: 'Speaker', listener: 'Listener' };
const REPORT_REASONS = ['Harassment', 'Hate speech', 'Spam', 'Misinformation', 'Something else'];

export interface RoomActions {
  leave(): void;
  /** Step out to the rest of the app while staying connected to the room. */
  minimize(): void;
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
  hostLeave(mode: 'auto' | 'end' | 'transfer', newHostId?: string): Promise<void>;
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

  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [newHost, setNewHost] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileTarget | null>(null);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);

  const ended = state?.room.status === 'ended';
  const over = !!blockedMsg || ended;
  const meId = state?.me.id;
  const signedIn = !!state && !state.me.isGuest;

  // Hide the global site nav while inside a live room.
  useEffect(() => {
    if (over) return;
    document.body.dataset.immersive = '1';
    return () => { delete document.body.dataset.immersive; };
  }, [over]);

  // Who you already follow, so the "+" only shows on people you could follow.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    api<{ followingIds?: string[] }>('/api/people?ids=1').then(r => { if (live) setFollowing(new Set(r.followingIds ?? [])); }).catch(() => {});
    return () => { live = false; };
  }, [signedIn, meId]);

  useEffect(() => {
    if (!menuOpen) return;
    const down = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [menuOpen]);

  if (over) {
    const removed = /removed/i.test(blockedMsg);
    return (
      <div className="container mid page">
        <div className="card card-pad gate rise">
          <span className="empty-ico">{removed ? <UserMinus size={24} /> : <Radio size={24} />}</span>
          <h1 className="display">{removed ? 'You’ve been removed' : 'That’s a wrap'}</h1>
          <p className="muted" role="alert">{blockedMsg || 'This room has ended.'}</p>
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
  const listeners = state?.listeners ?? [];
  const handsCount = state?.hands.length ?? 0;
  const audience = state?.audienceCount ?? 0;
  const anon = Math.max(0, audience - listeners.length);
  const handsOn = !!state?.room.hands_enabled;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      toast('Link copied. Share it anywhere.', 'ok');
    } catch { toast('Couldn’t copy the link', 'error'); }
  }

  async function follow(id: string) {
    try {
      await api(`/api/people/${id}`, { action: 'follow' });
      setFollowing(prev => new Set(prev).add(id));
      window.dispatchEvent(new Event('people-updated'));
    } catch (e: any) { toast(e.message || 'Could not follow', 'error'); }
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

  const leaveClick = () => (isHost ? setLeaving(true) : actions.leave());
  const canFollow = (id: string) => signedIn && id !== meId && !following.has(id);

  /** Room actions for the open profile (moderators only). */
  function modActions(p: ProfileTarget): ReactNode {
    if (!isMod || p.id === meId) return null;
    const close = () => setProfile(null);
    const item = (label: string, icon: ReactNode, fn: () => void, danger = false) => (
      <button key={label} type="button" className={`menu-item${danger ? ' danger' : ''}`} onClick={() => { close(); fn(); }}>{icon}{label}</button>
    );
    const m = stage.find(s => s.id === p.id);
    if (!m) {
      return [
        item('Invite to stage', <UserPlus />, () => actions.moderate('invite', p.id)),
        item('Remove from room', <UserMinus />, async () => {
          if (await confirm({ title: `Remove ${p.name} from the room?`, description: 'They’ll be disconnected and won’t be able to rejoin.', confirmLabel: 'Remove', tone: 'danger' })) actions.moderate('remove', p.id);
        }, true),
      ];
    }
    if (m.role === 'host' || (m.role === 'moderator' && !isHost)) return null; // moderators can’t act on other moderators
    return [
      item('Mute', <MicOff />, () => actions.moderate('mute', m.id)),
      item('Move to audience', <ArrowDownToLine />, () => actions.moderate('to_audience', m.id)),
      isHost && m.role !== 'moderator' && item('Appoint moderator', <ShieldCheck />, () => actions.moderate('appoint_mod', m.id)),
      isHost && m.role === 'moderator' && item('Remove moderator', <ShieldOff />, () => actions.moderate('remove_mod', m.id)),
      isHost && item('Make host', <Crown />, async () => {
        if (await confirm({ title: `Make ${m.name} the host?`, description: 'You’ll become a moderator. They get full control of the room.', confirmLabel: 'Transfer host' })) actions.moderate('transfer_host', m.id);
      }),
      item('Remove from room', <UserMinus />, async () => {
        if (await confirm({ title: `Remove ${m.name} from the room?`, description: 'They’ll be disconnected and won’t be able to rejoin.', confirmLabel: 'Remove', tone: 'danger' })) actions.moderate('remove', m.id);
      }, true),
    ];
  }

  const openProfile = (p: Person | StageMember) => setProfile({ id: p.id, name: p.name, avatar_url: p.avatar_url, username: p.username });

  return (
    <div className="room sheet">
      {inviteOpen && state && <InviteFriends slug={state.room.slug} onClose={() => setInviteOpen(false)} />}

      <header className="sheet-top">
        <button type="button" className="icon-btn" onClick={actions.minimize} aria-label="Minimize room" title="Keep listening while you browse">
          <ChevronDown size={26} strokeWidth={2.6} /><span className="sr-only">Minimize</span>
        </button>
        <span className="spacer" />
        {signedIn && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setInviteOpen(true)}><UserPlus size={18} />Ping</button>}
        <button type="button" className="icon-btn" onClick={copyLink} aria-label="Share room link"><Share size={22} /></button>
        <button type="button" className="leave-pill dock-leave" onClick={leaveClick} aria-label="Leave room"><span aria-hidden="true">✌️</span>leave</button>
      </header>

      <div className="room-head">
        <h1 className="room-title">{state?.room.title ?? 'Room'}</h1>
        <div className="room-menu" ref={menuRef}>
          <button type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Room options" onClick={() => setMenuOpen(o => !o)}>
            <Ellipsis size={24} />
          </button>
          {menuOpen && (
            <div className="menu" role="menu" aria-label="Room options">
              <button type="button" role="menuitem" className="menu-item" onClick={() => { setMenuOpen(false); void copyLink(); }}><Link2 />Copy link</button>
              {signedIn && <button type="button" role="menuitem" className="menu-item" onClick={() => { setMenuOpen(false); setInviteOpen(true); }}><UserPlus />Ping people</button>}
              {isMod && <button type="button" role="menuitem" className="menu-item" onClick={() => { setMenuOpen(false); setControlsOpen(true); }}><Info />Room controls</button>}
              {signedIn && <><div className="menu-sep" /><button type="button" role="menuitem" className="menu-item danger" onClick={() => { setMenuOpen(false); setReportOpen(true); }}><Flag />Report room</button></>}
            </div>
          )}
        </div>
      </div>
      {(status === 'connecting' || status === 'reconnecting') && <p className="room-status" role="status"><span className="spinner" />{status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}</p>}

      <main className="room-main">
        {me?.invitationId && (
          <div className="invite-banner rise" role="group" aria-label="Stage invitation">
            <span className="invite-ico"><Mic size={22} /></span>
            <div className="invite-text">
              <strong>You’re invited to speak.</strong>
              <span>You’ll join muted.</span>
            </div>
            <div className="invite-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={actions.acceptInvite}>Join stage</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={actions.declineInvite}>Decline</button>
            </div>
          </div>
        )}

        {status === 'blocked' && (
          <div className="alert alert-info banner" role="alert">
            <Volume2 />
            <div style={{ flex: 1 }}><strong>Audio is blocked</strong></div>
            <button type="button" className="btn btn-primary btn-sm" onClick={actions.startAudio}>Play audio</button>
          </div>
        )}
        {status === 'mic' && (
          <div className="alert alert-error banner" role="alert">
            <MicOff />
            <div>
              <strong>Microphone unavailable</strong>
              <div className="muted">Allow microphone access for this site, then try again.</div>
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

        {/* ── Speakers ──────────────────────────────────── */}
        <section aria-label="On stage">
          {stage.length === 0 ? (
            <div className="stage-empty"><Mic size={20} /><span>{state ? 'No one is on stage.' : 'Tuning in…'}</span></div>
          ) : (
            <ul className="speakers">
              {stage.map(m => (
                <PersonTile
                  key={m.id} person={m} size="lg" muted={m.muted}
                  speaking={(speaking.has(m.id) || m.speaking) && !m.muted}
                  leader={m.role === 'host' || m.role === 'moderator'} isMe={m.id === meId}
                  canFollow={canFollow(m.id)} onFollow={() => follow(m.id)} onOpen={() => openProfile(m)}
                  label={`${m.name}, ${ROLE_LABEL[m.role]}${m.muted ? ', muted' : ''}`}
                />
              ))}
            </ul>
          )}
        </section>

        {/* ── Just listening ────────────────────────────── */}
        {(listeners.length > 0 || anon > 0) && (
          <section aria-label="Listeners">
            <h2 className="sub-head">Just listening</h2>
            <ul className="listeners">
              {listeners.map(l => (
                <PersonTile
                  key={l.id} person={l} size="sm" isMe={l.id === meId}
                  canFollow={canFollow(l.id)} onFollow={() => follow(l.id)} onOpen={() => openProfile(l)}
                  label={`${l.name}, listening`}
                />
              ))}
              {anon > 0 && (
                <li className="ptile s-sm anon">
                  <div className="ptile-top"><span className="ptile-av"><span className="avatar anon-av" style={{ ['--size' as string]: '64px' }}><Headphones size={22} /></span></span></div>
                  <div className="ptile-name"><span className="txt">{anon} anon</span></div>
                </li>
              )}
            </ul>
          </section>
        )}
      </main>

      {/* ── Bottom bar ───────────────────────────────────── */}
      <div className="sheet-bottom" role="toolbar" aria-label="Room controls">
        {onStage ? (
          !micEver ? (
            <button type="button" className="action-pill primary" onClick={() => actions.setMic(true)} aria-label="Enable microphone">
              <Mic size={20} />enable mic
            </button>
          ) : micOn ? (
            <button type="button" className="action-pill live" onClick={() => actions.setMic(false)}>
              <Mic size={20} />mic on
            </button>
          ) : (
            <button type="button" className="action-pill" onClick={() => actions.setMic(true)}>
              <MicOff size={20} />mic off
            </button>
          )
        ) : me && !me.isGuest && handsOn ? (
          me.handPending ? (
            <button type="button" className="action-pill raised" onClick={actions.lowerHand}><Hand size={20} />lower hand</button>
          ) : (
            <button type="button" className="action-pill primary" onClick={actions.raiseHand}><Hand size={20} />ask to speak</button>
          )
        ) : me?.isGuest ? (
          <Link href="/login" className="action-pill primary"><Hand size={20} />sign in to speak</Link>
        ) : (
          <span className="action-note"><Pause size={16} />hands are paused</span>
        )}

        <span className="spacer" />

        {onStage && !isHost && (
          <button type="button" className="icon-btn round" onClick={() => me && actions.toAudience(me.id)} aria-label="Move to audience" title="Move to audience">
            <ArrowDownToLine size={22} />
          </button>
        )}
        {isMod && (
          <button type="button" className="icon-btn round" onClick={() => setControlsOpen(true)} aria-label="Room controls">
            <Info size={22} />
            {handsCount > 0 && <b className="count-dot">{handsCount}</b>}
          </button>
        )}
      </div>

      {/* ── Someone's profile ────────────────────────────── */}
      <ProfileSheet target={profile} onClose={() => setProfile(null)}>{profile ? modActions(profile) : null}</ProfileSheet>

      {/* ── Room controls (moderators) ───────────────────── */}
      <Modal open={controlsOpen && isMod} onClose={() => setControlsOpen(false)} title="Room controls" wide>
        <RoomPanel state={state} isHost={isHost} isMod={isMod} onEnd={endRoom} actions={actions} />
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
            <button type="button" className="btn btn-outline" onClick={() => setReportOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={sending || !reason.trim()}>
              {sending ? <span className="spinner" /> : <><Send size={16} />Send report</>}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Host leave ───────────────────────────────────── */}
      <Modal
        open={leaving && isHost} onClose={() => setLeaving(false)}
        title="Leave the room?" description={stageOthers.length ? 'The room keeps running while someone is on the panel. The next speaker becomes moderator if needed.' : 'You’re the last person on the panel. Leaving ends the room for everyone immediately.'} icon={<Crown size={22} />}
      >
        <button type="button" className="btn btn-primary btn-block" onClick={() => actions.hostLeave('auto')}>{stageOthers.length ? 'Leave room running' : 'Leave and end room'}</button>
        <div className="or"><span>or choose a new host</span></div>
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

/* ── One person: avatar, name, optional follow "+" ───────── */
function PersonTile({
  person, size, speaking = false, muted = false, leader = false, isMe = false, canFollow = false, onOpen, onFollow, label,
}: {
  person: Person | StageMember; size: 'lg' | 'sm'; speaking?: boolean; muted?: boolean; leader?: boolean; isMe?: boolean;
  canFollow?: boolean; onOpen: () => void; onFollow?: () => void; label: string;
}) {
  return (
    <li className={`ptile s-${size}${speaking ? ' speaking' : ''}`}>
      <div className="ptile-top">
        <button type="button" className="ptile-av" onClick={onOpen} aria-label={label}>
          <Avatar name={person.name} src={person.avatar_url} size={size === 'lg' ? 84 : 62} />
          {muted && <span className="ptile-mute" aria-hidden="true"><MicOff size={size === 'lg' ? 16 : 13} /></span>}
        </button>
        {canFollow && (
          <button type="button" className="ptile-plus" onClick={onFollow} aria-label={`Follow ${person.name}`}><Plus size={size === 'lg' ? 17 : 14} strokeWidth={3.2} /></button>
        )}
      </div>
      <div className="ptile-name" title={person.name} onClick={onOpen}>
        {leader && <span className="star" aria-hidden="true"><Asterisk size={13} strokeWidth={3.4} /></span>}
        <span className="txt">{person.name}</span>
        {isMe && <span className="you">you</span>}
      </div>
    </li>
  );
}

/* ── Room controls (hand queue, host controls) ───────────── */
function RoomPanel({
  state, isHost, isMod, onEnd, actions,
}: {
  state: RoomState | null; isHost: boolean; isMod: boolean; onEnd: () => void; actions: RoomActions;
}) {
  const room = state?.room;
  const hands = state?.hands ?? [];
  return (
    <div className="panel">
      {isMod && (
        <section className="panel-sec">
          <div className="panel-h-row">
            <h2 className="panel-h">Raised hands <span className="count">{hands.length}</span></h2>
            {room?.hands_enabled
              ? <button type="button" className="btn btn-outline btn-sm" onClick={() => actions.moderate('pause_hands')}><Pause size={14} />Pause</button>
              : <button type="button" className="btn btn-primary btn-sm" onClick={() => actions.moderate('resume_hands')}><Play size={14} />Resume</button>}
          </div>

          {hands.length === 0 ? (
            <div className="queue-empty"><Hand size={20} /><span>No raised hands.</span></div>
          ) : (
            <ul className="queue">
              {hands.map(h => (
                <li key={h.userId} className="queue-item">
                  <Avatar name={h.name} size={40} />
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
          <h2 className="panel-h">Host</h2>
          <button type="button" className="btn btn-danger btn-block" onClick={onEnd}><Radio size={16} />End room</button>
        </section>
      )}
    </div>
  );
}
