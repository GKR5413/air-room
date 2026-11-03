import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Globe, Headphones } from 'lucide-react';
import Avatar from './Avatar';
import { glowHue, languageName } from '@/lib/format';

export type RoomItem = {
  slug: string; title: string; topic: string; language: string; host_name: string; audience: number;
};

/** A live room in the Explore grid. With `preview`, it renders as a non-interactive sample. */
export default function RoomCard({ room, index = 0, preview = false }: { room: RoomItem; index?: number; preview?: boolean }) {
  const style = { '--h': glowHue(room.slug || room.title), '--d': index } as CSSProperties;
  const body = (
    <>
      <div className="rc-top">
        <span className="live-badge">Live</span>
        <span className="rc-listeners" title="Listening now">
          <span className="eq" aria-hidden="true"><i /><i /><i /><i /></span>
          <Headphones size={14} aria-hidden="true" />
          <b>{room.audience}</b><span className="sr-only"> listening</span>
        </span>
      </div>

      <h3 className="rc-title">{room.title || 'Untitled room'}</h3>

      <div className="rc-host">
        <Avatar name={room.host_name || '?'} size={36} />
        <div>
          <div className="rc-host-name">{room.host_name}</div>
          <div className="rc-host-role">Host</div>
        </div>
      </div>

      <div className="rc-foot">
        <div className="rc-chips">
          {room.topic && <span className="chip">{room.topic}</span>}
          {room.language && <span className="chip"><Globe aria-hidden="true" />{languageName(room.language)}</span>}
        </div>
        {!preview && <span className="rc-go" aria-hidden="true"><ArrowUpRight size={18} /></span>}
      </div>
    </>
  );

  return preview
    ? <div className="room-card is-preview" style={style}>{body}</div>
    : <Link href={`/r/${room.slug}`} className="room-card rise" style={style}>{body}</Link>;
}
