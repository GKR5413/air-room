import type { Metadata, Viewport } from 'next';
import { Nunito } from 'next/font/google';
import Providers from '@/components/Providers';
import Nav from '@/components/Nav';
import RoomSessionProvider from '@/components/RoomSession';
import CallProvider from '@/components/CallProvider';
import RoomInvitationsProvider from '@/components/RoomInvitations';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/pages.css';
import './styles/room.css';
import './styles/chat.css';

const sans = Nunito({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'AirRoom — live audio rooms', template: '%s · AirRoom' },
  description: 'Live audio rooms. Listen free, raise your hand, take the stage.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#1b1c20' },
    { media: '(prefers-color-scheme: light)', color: '#f2f3f6' },
  ],
};

/** Runs before first paint so a saved theme never flashes the wrong colours. */
const THEME_SCRIPT = `try{var t=localStorage.getItem('airroom-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <RoomSessionProvider>
            <CallProvider>
              <RoomInvitationsProvider>
                <Nav />
                {children}
              </RoomInvitationsProvider>
            </CallProvider>
          </RoomSessionProvider>
        </Providers>
      </body>
    </html>
  );
}
