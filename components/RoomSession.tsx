'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useConfirm } from './Providers';

/**
 * Keeps the room you joined alive while you browse. It lives in the root layout,
 * which never unmounts, so navigating to Explore, Profile or another room's page
 * no longer disconnects you. You leave only via a Leave button (or when the room ends).
 */

const STORE = 'airroom-active-room';

type Session = {
  /** Slug of the room you are currently in, or null. */
  slug: string | null;
  /** Enter a room. Asks before taking you out of a different one. Resolves false if you decline. */
  join(slug: string, beforeJoin?: () => Promise<void>): Promise<boolean>;
  leave(): void;
};

const Ctx = createContext<Session>({ slug: null, join: async () => false, leave: () => {} });
export const useRoomSession = () => useContext(Ctx);

// livekit-client is ~150 kB: only fetched once someone actually joins a room.
function RoomLoading() {
  const pathname = usePathname();
  const { slug } = useRoomSession();
  if (!slug || pathname !== `/r/${slug}`) return null;
  return <div className="room-loading" role="status" aria-label="Joining room"><span className="spinner" /></div>;
}
const LiveRoom = dynamic(() => import('./LiveRoom'), { ssr: false, loading: () => <RoomLoading /> });

export default function RoomSessionProvider({ children }: { children: ReactNode }) {
  const confirm = useConfirm();
  const router = useRouter();
  const pathname = usePathname();
  const [slug, setSlug] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const slugRef = useRef<string | null>(null);
  const titleRef = useRef('');
  const restored = useRef(false);
  const lastPage = useRef('/');
  slugRef.current = slug;
  titleRef.current = title;

  // Rejoin after a page refresh, so a reload does not silently drop you from the room.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE);
      if (saved) setSlug(saved);
    } catch { /* storage unavailable */ }
    restored.current = true;
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try {
      if (slug) sessionStorage.setItem(STORE, slug); else sessionStorage.removeItem(STORE);
    } catch { /* storage unavailable */ }
  }, [slug]);

  // Where "Minimize" returns to: the last page that was not a room page (falls back to Explore).
  useEffect(() => {
    if (!pathname.startsWith('/r/')) lastPage.current = pathname;
  }, [pathname]);

  const join = useCallback(async (next: string, beforeJoin?: () => Promise<void>) => {
    const current = slugRef.current;
    if (current && current !== next) {
      const ok = await confirm({
        title: 'Switch rooms?',
        description: `You’re in “${titleRef.current || 'another room'}”. Joining this one will take you out of it.`,
        confirmLabel: 'Switch rooms',
      });
      if (!ok) return false;
    }
    // Validate/accept the invitation only after any room-switch confirmation.
    // A failed or cancelled invitation leaves the current session untouched.
    await beforeJoin?.();
    if (current === next) return true;
    setTitle('');
    setSlug(next);
    return true;
  }, [confirm]);

  const leave = useCallback(() => { setSlug(null); setTitle(''); }, []);
  const minimize = useCallback(() => { router.push(lastPage.current || '/'); }, [router]);
  const value = useMemo<Session>(() => ({ slug, join, leave }), [slug, join, leave]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {slug && (
        <LiveRoom
          key={slug} slug={slug} visible={pathname === `/r/${slug}`}
          onLeave={leave} onMinimize={minimize} onTitle={setTitle}
        />
      )}
    </Ctx.Provider>
  );
}
