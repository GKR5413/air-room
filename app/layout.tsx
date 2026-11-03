import type { Metadata, Viewport } from 'next';
import { Geist, Instrument_Serif } from 'next/font/google';
import Providers from '@/components/Providers';
import Nav from '@/components/Nav';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/pages.css';
import './styles/room.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'AirRoom — live audio rooms', template: '%s · AirRoom' },
  description: 'Drop into live audio conversations. Listen for free, raise your hand, and take the stage.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0d0b09' },
    { media: '(prefers-color-scheme: light)', color: '#f6f1e7' },
  ],
};

/** Runs before first paint so a saved theme never flashes the wrong colours. */
const THEME_SCRIPT = `try{var t=localStorage.getItem('airroom-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <div className="ambient" aria-hidden="true"><i /><i /><i /></div>
        <div className="grain" aria-hidden="true" />
        <Providers>
          <Nav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
