'use client';
import { use, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mic, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, SendHorizontal, Trash2, Video, Check, CircleAlert, Lock } from 'lucide-react';
import { api, supabase } from '@/lib/supabase-browser';
import { useChatLive } from '@/lib/use-chat-live';
import { useVoiceRecorder } from '@/lib/use-voice-recorder';
import { callLabel, formatDuration } from '@/lib/chat-core';
import { clockTime, dayLabel, type ChatMessage, type ChatPerson } from '@/lib/chat-types';
import Avatar from '@/components/Avatar';
import VoiceBubble from '@/components/VoiceBubble';
import { useCall } from '@/components/CallProvider';
import { useToast } from '@/components/Providers';

type Meta = { person: ChatPerson; canChat: boolean; otherReadAt: string | null };
type Page = Meta & { hasMore: boolean; messages: ChatMessage[] };

/** Keep older pages you've scrolled back to, replace the latest page with fresh data, keep unsent messages. */
function mergeLatest(prev: ChatMessage[], latest: ChatMessage[], meId: string): ChatMessage[] {
  const first = latest[0]?.created_at;
  const older = prev.filter(m => !m.pending && (first ? m.created_at < first : true));
  // A live update can arrive while your message is still on its way: once the server's copy shows up, drop the draft.
  const arrived = (d: ChatMessage) => latest.some(m => m.sender_id === meId && m.kind === d.kind && Date.parse(m.created_at) >= Date.parse(d.created_at) - 5000
    && (d.kind === 'voice' ? m.duration_ms === d.duration_ms : m.body === d.body));
  return [...older, ...latest, ...prev.filter(m => m.pending && !arrived(m))];
}

export default function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { startCall, inCall } = useCall();
  const [meId, setMeId] = useState('');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true); // keep the view pinned to the newest message
  const lastRead = useRef('');

  // A chat is a full-screen conversation: hide the app's own bars (same switch the live room uses).
  useEffect(() => {
    document.body.dataset.immersive = '1';
    return () => { delete document.body.dataset.immersive; };
  }, []);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { setMeId(data.session?.user.id ?? ''); if (!data.session) setNeedsLogin(true); }); }, []);

  const nearBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 180;
  const scrollDown = (smooth = false) => bottom.current?.scrollIntoView({ block: 'end', behavior: smooth ? 'smooth' : 'auto' });

  const markRead = useCallback((list: ChatMessage[]) => {
    const newest = list.filter(m => m.sender_id !== meId && !m.pending).at(-1)?.created_at;
    if (!newest || newest <= lastRead.current || document.visibilityState !== 'visible') return;
    lastRead.current = newest;
    void api(`/api/chat/conversations/${id}/read`, {}).catch(() => {});
  }, [id, meId]);

  const load = useCallback(async () => {
    try {
      const page = await api<Page>(`/api/chat/conversations/${id}/messages`);
      stick.current = nearBottom();
      setMeta({ person: page.person, canChat: page.canChat, otherReadAt: page.otherReadAt });
      setHasMore(page.hasMore);
      setMessages(prev => mergeLatest(prev, page.messages, meId));
      setError('');
      markRead(page.messages);
    } catch (e: any) {
      if (/sign in/i.test(e.message)) setNeedsLogin(true); else setError(e.message);
    }
  }, [id, markRead, meId]);
  useEffect(() => { if (meId) void load(); }, [meId, load]);
  useChatLive(load, 12000, !!meId);

  // Stay at the bottom when new messages arrive (unless you've scrolled up to read).
  useLayoutEffect(() => { if (stick.current) scrollDown(); }, [messages]);

  async function earlier() {
    if (loadingMore || !messages.length) return;
    setLoadingMore(true);
    const before = messages.find(m => !m.pending)?.created_at;
    try {
      const page = await api<Page>(`/api/chat/conversations/${id}/messages?before=${encodeURIComponent(before ?? '')}`);
      stick.current = false;
      setHasMore(page.hasMore);
      setMessages(prev => [...page.messages, ...prev]);
    } catch (e: any) { toast(e.message || 'Could not load earlier messages', 'error'); }
    finally { setLoadingMore(false); }
  }

  /** Show a message straight away, then swap in the real one (or take it back if sending fails). */
  async function post(draft: ChatMessage, payload: Record<string, unknown>, restore?: () => void) {
    stick.current = true;
    setMessages(m => [...m, draft]);
    try {
      const { message } = await api<{ message: ChatMessage }>(`/api/chat/conversations/${id}/messages`, payload);
      setMessages(m => [...m.filter(x => x.id !== draft.id && x.id !== message.id), message]);
    } catch (e: any) {
      setMessages(m => m.filter(x => x.id !== draft.id));
      restore?.();
      toast(e.message || 'Could not send', 'error');
    }
  }

  function sendText() {
    const body = text.trim();
    if (!body || !meta?.canChat) return;
    setText('');
    if (input.current) input.current.style.height = '';
    void post(
      { id: `tmp-${Date.now()}`, sender_id: meId, kind: 'text', body, duration_ms: null, call_kind: null, created_at: new Date().toISOString(), pending: true },
      { kind: 'text', body }, () => setText(body),
    );
  }

  const rec = useVoiceRecorder(() => void sendVoice());
  async function startRecording() {
    try { await rec.start(); } catch (e: any) { toast(e.message || 'Could not start recording', 'error'); }
  }
  async function sendVoice() {
    const r = await rec.stop();
    if (!r || r.durationMs < 600) { if (r) toast('Hold on a little longer to record', 'info'); return; }
    void post(
      { id: `tmp-${Date.now()}`, sender_id: meId, kind: 'voice', body: '', duration_ms: r.durationMs, call_kind: null, created_at: new Date().toISOString(), pending: true },
      { kind: 'voice', audio: r.dataUrl, duration_ms: r.durationMs },
    );
  }

  if (needsLogin) {
    return (
      <main className="container mid page">
        <div className="card card-pad gate rise">
          <span className="empty-ico"><Lock size={24} /></span>
          <h1 className="display">Sign in to message</h1>
          <Link href="/login" className="btn btn-primary btn-lg">Sign in</Link>
        </div>
      </main>
    );
  }

  const can = !!meta?.canChat;
  const lastMine = [...messages].reverse().find(m => m.sender_id === meId && !m.pending);
  const seen = !!lastMine && !!meta?.otherReadAt && meta.otherReadAt >= lastMine.created_at;
  let day = '';

  return (
    <div className="chat">
      <header className="chat-top">
        <Link href="/messages" className="icon-btn" aria-label="Back to messages" style={{ background: 'transparent' }}><ArrowLeft size={24} /></Link>
        {meta ? (
          <Link href={`/u/${meta.person.id}`} className="chat-who" aria-label={`${meta.person.name}’s profile`}>
            <Avatar name={meta.person.name} src={meta.person.avatar_url} size={44} />
            <span><strong>{meta.person.name}</strong>{meta.person.username && <small>@{meta.person.username}</small>}</span>
          </Link>
        ) : <span className="chat-who"><span className="skeleton" style={{ width: 44, height: 44, borderRadius: '36%' }} /></span>}
        <span className="spacer" />
        <button type="button" className="icon-btn" onClick={() => void startCall(id, 'audio')} disabled={!can || inCall} aria-label="Voice call"><Phone size={22} /></button>
        <button type="button" className="icon-btn" onClick={() => void startCall(id, 'video')} disabled={!can || inCall} aria-label="Video call"><Video size={22} /></button>
      </header>

      <div className="chat-body">
        {hasMore && <button type="button" className="earlier" onClick={earlier} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Earlier messages'}</button>}
        {error && <div className="alert alert-error" role="alert"><CircleAlert /><span>{error}</span></div>}
        {!messages.length && meta && !error && <p className="chat-empty">Say hi to {meta.person.name.split(' ')[0]} 👋</p>}

        {messages.map(m => {
          const label = dayLabel(m.created_at);
          const sep = label !== day ? (day = label) : null;
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className="msg-wrap">
              {sep && <div className="day-sep"><span>{sep}</span></div>}
              {m.kind === 'call' ? (
                <div className={`call-row${m.body === 'missed' || (m.body === 'canceled' && !mine) ? ' missed' : ''}`}>
                  {m.body === 'completed' ? (mine ? <PhoneOutgoing size={16} /> : <PhoneIncoming size={16} />) : m.body === 'declined' ? <Phone size={16} /> : <PhoneMissed size={16} />}
                  <span>{callLabel(m.call_kind, m.body, m.duration_ms, mine)}</span>
                  <time dateTime={m.created_at}>{clockTime(m.created_at)}</time>
                </div>
              ) : (
                <div className={`bubble ${mine ? 'mine' : 'theirs'}${m.pending ? ' pending' : ''}`}>
                  {m.kind === 'voice'
                    ? <VoiceBubble id={m.id} durationMs={m.duration_ms ?? 0} pending={m.pending} />
                    : <p>{m.body}</p>}
                  <time dateTime={m.created_at}>{clockTime(m.created_at)}</time>
                </div>
              )}
              {lastMine?.id === m.id && seen && <p className="seen"><Check size={12} />Seen</p>}
            </div>
          );
        })}
        <div ref={bottom} className="chat-end" />
      </div>

      <footer className="composer">
        {!can && meta && (
          <p className="composer-note" role="status"><Lock size={14} />You can message each other once you both follow each other.</p>
        )}
        {rec.recording ? (
          <div className="recording" role="status" aria-label="Recording a voice message">
            <button type="button" className="icon-btn round" onClick={rec.cancel} aria-label="Discard recording"><Trash2 size={22} /></button>
            <span className="rec-dot" aria-hidden="true" />
            <span className="rec-time">{formatDuration(rec.ms)}</span>
            <span className="spacer" />
            <button type="button" className="send-btn" onClick={() => void sendVoice()} aria-label="Send voice message"><SendHorizontal size={22} /></button>
          </div>
        ) : (
          <div className="compose-row">
            <textarea
              ref={input} className="composer-input" rows={1} value={text} maxLength={2000} placeholder="Message"
              aria-label="Message" disabled={!can}
              onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); sendText(); } }}
              onFocus={() => { stick.current = true; setTimeout(() => scrollDown(), 250); }}
            />
            {text.trim() ? (
              <button type="button" className="send-btn" onClick={sendText} disabled={!can} aria-label="Send"><SendHorizontal size={22} /></button>
            ) : (
              <button type="button" className="send-btn mic" onClick={() => void startRecording()} disabled={!can} aria-label="Record a voice message"><Mic size={22} /></button>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
