# AirRoom (MVP, functionality first)

Next.js + Supabase (auth, Postgres) + LiveKit Cloud (audio).

## Setup
1. `npm install`
2. Supabase: run `supabase/migrations/0001_init.sql` in the SQL editor. In Auth settings, turn off email confirmation for easy local testing.
3. Copy `.env.example` to `.env.local` and fill in Supabase URL, anon key, service role key, LiveKit URL, API key and secret.
4. `npm run dev`, open http://localhost:3000

## Acceptance test
Use two devices on different networks (or a normal and an incognito window).
1. Device A: sign up, Create room, it goes live.
2. Device B: open `/r/<slug>` as a guest, click Join and listen (no mic prompt), hear the host after A enables the mic.
3. B signs in, joins, Raise hand. A invites to stage. B accepts (joins muted), then clicks Enable microphone.
4. A clicks Move to audience. B refreshes: can still listen, cannot publish.

## Notes
- Live updates use 2s polling of `/api/rooms/[slug]/state` (swap for Realtime later).
- API reference: `CONTRACT.md`.
- Not yet run against real Supabase/LiveKit keys.

## Design system
Hand-written CSS, no UI framework. The look is "late-night radio": warm ink (dark) or cream paper (light), one coral "on-air" accent, Instrument Serif display type with Geist for UI. Theme follows the OS and can be toggled (saved in `localStorage`).
- `app/styles/tokens.css` colours, radii, motion, light/dark themes. Start here to re-skin.
- `app/styles/base.css` reset, type, ambient backdrop, keyframes. `ui.css` buttons, fields, chips, modal, toast. `pages.css` and `room.css` are per-screen.
- `components/LiveRoom.tsx` owns LiveKit, polling and server actions. `components/RoomView.tsx` is purely presentational, so room UI can be developed with mock props.
- `useToast()` and `useConfirm()` (from `components/Providers.tsx`) replace `alert()` / `confirm()`.
- Respects `prefers-reduced-motion`.
