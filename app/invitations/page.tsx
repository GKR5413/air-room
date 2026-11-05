'use client';
import Link from 'next/link';
import { CircleAlert, Lock, Mail, RefreshCw } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useRoomInvitations } from '@/components/RoomInvitations';

export default function Invitations() {
  const { invitations, error, needsLogin, busy, refresh: load, respond } = useRoomInvitations();

  return (
    <main className="container mid page">
      <header className="page-head rise">
        <h1 className="display page-title">Invitations</h1>
      </header>

      {needsLogin ? (
        <div className="card card-pad gate rise">
          <span className="empty-ico"><Lock size={24} /></span>
          <h2 className="display">Sign in to see invitations</h2>
          <Link href="/login" className="btn btn-primary btn-lg">Sign in</Link>
        </div>
      ) : (
        <>
          {error && (
            <div className="alert alert-error" role="alert">
              <CircleAlert /><span style={{ flex: 1 }}>{error}</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}><RefreshCw size={14} />Retry</button>
            </div>
          )}

          {!invitations && !error && (
            <ul className="invite-list" aria-busy="true" aria-label="Loading invitations">
              {[0, 1].map(i => (
                <li key={i} className="invite-card card">
                  <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '50%' }} />
                  <div className="invite-info"><div className="skeleton" style={{ height: 13, width: '38%' }} /><div className="skeleton" style={{ height: 24, width: '66%' }} /></div>
                </li>
              ))}
            </ul>
          )}

          {invitations?.length === 0 && (
            <div className="empty rise">
              <span className="empty-ico"><Mail size={24} /></span>
              <h3 className="display">No invitations</h3>
              <p className="muted">Invites from friends appear here.</p>
            </div>
          )}

          {!!invitations?.length && (
            <ul className="invite-list">
              {invitations.map((i, n) => (
                <li key={i.id} className="invite-card card rise" style={{ '--d': n } as React.CSSProperties}>
                  <Avatar name={i.sender?.display_name ?? 'Friend'} src={i.sender?.avatar_url} size={40} />
                  <div className="invite-info">
                    <span className="faint">{i.sender?.display_name ?? 'A friend'} invited you to join</span>
                    <strong className="invite-room">{i.room.title}</strong>
                  </div>
                  <div className="invite-actions">
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => respond(i, 'accept')}>Join</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => respond(i, 'dismiss')}>Dismiss</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
