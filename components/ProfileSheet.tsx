'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { isGuestId } from '@/lib/ids';
import Modal from './Modal';
import ProfileCard from './ProfileCard';

export type ProfileTarget = { id: string; name: string; avatar_url?: string | null; username?: string | null };

/** A person's profile as a bottom sheet. `children` adds room actions (e.g. moderation) under it. */
export default function ProfileSheet({ target, onClose, children }: { target: ProfileTarget | null; onClose: () => void; children?: ReactNode }) {
  const guest = !!target && isGuestId(target.id);
  return (
    <Modal open={!!target} onClose={onClose} title="Profile">
      {target && (
        <div className="sheet-profile">
          {guest ? (
            <ProfileCard key={target.id} who="-" fallback={{ name: 'Guest' }} />
          ) : (
            <ProfileCard
              key={target.id} who={target.id} fallback={target}
              footer={<>
                <Link href={`/u/${target.id}`} className="link-btn sheet-full" onClick={onClose}>View full profile</Link>
                {children && <div className="sheet-actions">{children}</div>}
              </>}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
