'use client';
import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ProfileCard from '@/components/ProfileCard';

/** Anyone's public profile, shareable as /u/<id> or /u/<username>. */
export default function PublicProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <main className="container mid page">
      <Link href="/" className="back-link"><ArrowLeft size={16} />Back</Link>
      <div className="card card-pad rise"><ProfileCard who={id} /></div>
    </main>
  );
}
