import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Headphones } from 'lucide-react';
import Avatar from './Avatar';

export type RoomItem = {
  slug: string; title: string; topic: string; language: string; host_name: string; host_avatar_url?: string | null; audience: number;
  /** People on stage right now, host first. */
  speakers?: { id: string; name: string; avatar_url?: string | null }[];
};

/** A live room in the home feed: title and host on the left, who's speaking on the right. */
export default function RoomCard({ room, index = 0 }: { room: RoomItem; index?: number }) {
  const all = (room.speakers?.length ? room.speakers : [{ id: 'host', name: room.host_name, avatar_url: room.host_avatar_url }]).slice(0, 4);
  // The "+N" bubble takes the last slot when there are more people than faces.
  const faces = room.audience > all.length && all.length === 4 ? all.slice(0, 3) : all;
  const more = Math.max(0, room.audience - faces.length);
  return (
    <Link href={`/r/${room.slug}`} className="feed-card rise" style={{ animationDelay: `${index * 40}ms` } as CSSProperties}>
      <div className="fc-main">
        <div className="fc-host">
          <Avatar name={room.host_name || '?'} src={room.host_avatar_url} size={24} />
          <span>{room.host_name}</span>
        </div>
        <h3 className="fc-title">{room.title || 'Untitled room'}</h3>
        <p className="fc-meta">
          <Headphones size={14} aria-hidden="true" />
          <span>{room.audience}<span className="sr-only"> listening</span></span>
          {room.topic && <><i aria-hidden="true">·</i><span>{room.topic}</span></>}
        </p>
      </div>

      <div className={`fc-faces n${faces.length + (more > 0 ? 1 : 0)}`} aria-hidden="true">
        {faces.map(f => <Avatar key={f.id} className="fc-face" name={f.name} src={f.avatar_url} size={54} />)}
        {more > 0 && <span className="fc-face fc-more">+{more}</span>}
      </div>
    </Link>
  );
}
