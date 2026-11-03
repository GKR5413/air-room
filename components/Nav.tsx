'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase-browser';
import Avatar from './Avatar';
import { Brand } from './Logo';
import ThemeToggle from './ThemeToggle';

type Who = { name: string } | null;

export default function Nav() {
  const path = usePathname();
  const [who, setWho] = useState<Who | undefined>(undefined);

  useEffect(() => {
    const pick = (u: { email?: string; user_metadata?: Record<string, any> } | null | undefined): Who =>
      u ? { name: u.user_metadata?.display_name || u.email?.split('@')[0] || 'You' } : null;
    supabase.auth.getSession().then(({ data }) => setWho(pick(data.session?.user)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setWho(pick(session?.user)));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="site-nav">
      <div className="container site-nav-inner">
        <Link href="/" className="brand" aria-label="AirRoom home"><Brand /></Link>

        <nav className="nav-links" aria-label="Primary">
          <Link href="/" className="nav-link" aria-current={path === '/' ? 'page' : undefined}>Explore</Link>
          <Link href="/create" className="nav-link" aria-current={path === '/create' ? 'page' : undefined}>Host</Link>
        </nav>

        <div className="nav-spacer" />

        <ThemeToggle />
        <Link href="/create" className="btn btn-primary btn-sm nav-cta" aria-label="Create a room">
          <Plus size={16} strokeWidth={2.6} /><span className="hide-sm">Start a room</span>
        </Link>
        {who === undefined ? (
          <span className="nav-slot" aria-hidden="true" />
        ) : who ? (
          <Link href="/me" className="nav-me" aria-label={`Profile: ${who.name}`} title={who.name}>
            <Avatar name={who.name} size={38} />
          </Link>
        ) : (
          <Link href="/login" className="btn btn-outline btn-sm">Sign in</Link>
        )}
      </div>
    </header>
  );
}
