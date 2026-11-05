# AirRoom (MVP, functionality first)

Next.js + Supabase (auth, Postgres) + LiveKit Cloud (audio).

## Setup
1. `npm install`
2. Supabase: run the SQL files in `supabase/migrations/` in numeric order in the SQL editor. In Auth settings, turn off email confirmation for easy local testing.
3. Copy `.env.example` to `.env.local` and fill in Supabase URL, anon key, service role key, LiveKit URL, API key and secret.
4. `npm run dev`, open http://localhost:3000

## Acceptance test
Use two devices on different networks (or a normal and an incognito window).
1. Device A: sign up, Create room, it goes live.
2. Device B: open `/r/<slug>` as a guest, click Join and listen (no mic prompt), hear the host after A enables the mic.
3. B signs in, joins, Raise hand. A invites to stage. B accepts (joins muted), then clicks Enable microphone.
4. A clicks Move to audience. B refreshes: can still listen, cannot publish.

## Notes
- Live updates use Supabase Realtime invalidation broadcasts (migration 0006) and LiveKit events, with 2s room / 5s hallway fallback reconciliation.
- API reference: `CONTRACT.md`.
- Hosted Supabase/LiveKit two-account verification is still required; local API tests stub those services.

## Design system
Hand-written CSS, no UI framework. The look is "late-night radio": warm ink (dark) or cream paper (light), one coral "on-air" accent, Instrument Serif display type with Geist for UI. Theme follows the OS and can be toggled (saved in `localStorage`).
- `app/styles/tokens.css` colours, radii, motion, light/dark themes. Start here to re-skin.
- `app/styles/base.css` reset, type, ambient backdrop, keyframes. `ui.css` buttons, fields, chips, modal, toast. `pages.css` and `room.css` are per-screen.
- `components/LiveRoom.tsx` owns LiveKit, polling and server actions. `components/RoomView.tsx` is purely presentational, so room UI can be developed with mock props.
- `useToast()` and `useConfirm()` (from `components/Providers.tsx`) replace `alert()` / `confirm()`.
- Respects `prefers-reduced-motion`.

## Profile and connections
- Apply `supabase/migrations/0004_profile_social.sql` to existing databases before using usernames. Existing users choose a username on their Profile page; usernames are unique, lowercase, and 3–24 letters, numbers or underscores.
- On `/me`, select or remove a profile photo; the photo saves immediately. The browser crops and resizes decodable images under 15 MB into a 256px JPEG; the server accepts PNG/JPEG/WebP data URLs under 700000 characters in the existing avatar field.
- Use Find people to search by username, Follow or Unfollow, and manage Followers with Remove follower. Removing a follower allows them to follow again later.
- Check with two signed-in accounts: save different usernames/photos, try claiming the same username, follow each other, unfollow, and remove a follower. Refresh both accounts to verify persistence.
- API validation and ownership checks: `node --test tests/profile-api.test.cjs`; TypeScript: `npm run typecheck`.

## Invite friends to rooms
- Apply `supabase/migrations/0005_room_invites.sql` after migration 0004.
- In a joined live room, signed-in users select **Ping** (also **Ping people** in room options) and invite people they follow. Each person can receive one invite per room, preventing repeated invites after dismissal.
- Recipients see an in-app notification on any page with the inviter's name, room title, **Join** and **Dismiss**. Pings also appear in **Invitations** and its navigation badge. One shared inbox refreshes through private Realtime signals, with a 5-second fallback. **Join** accepts the invitation and starts the live room session directly. Switching from another room asks first; cancelling keeps the invite pending. A private call must be ended before joining a room. **Dismiss** removes the invite; **Remind me later** hides the banner for this session and keeps it in the inbox. Ended rooms and rooms the recipient is banned from are hidden.
- These invites are independent of invitations to speak on stage. They do not grant microphone access.
- Verify with two accounts: A follows B, joins a room and pings B; B sees the notification while browsing, clicks **Join**, and enters the live room without another lobby click. Also test inbox joining, dismissal, cancelling a room switch, duplicate pings, and ending the room.
- Run API checks with `node --test tests/*.test.cjs`.

## Signup: email rate limit exceeded
Signup uses Supabase Auth directly. `over_email_send_rate_limit` comes from Auth's email delivery limit; changing app code or database migrations does not raise it. The built-in sender is for testing, is limited to 2 auth emails per hour per project, and only delivers to project team addresses.

- **Local/test project:** in Supabase Dashboard, open Authentication → Sign In / Providers → Email and turn off **Confirm email**. New email/password signups then return a session without sending a confirmation email. Apply this only to your test project.
- **Production:** configure Authentication → Email → SMTP Settings with your mail provider's host, port, username, password and verified sender. Then review Authentication → Rate Limits and set the email quota to match your provider's capacity. Keep email confirmation enabled.
- After configuration, test one signup and inspect Authentication logs for errors. Repeated signup attempts while the quota is exhausted will not restore email delivery.
- The app has no signup or sign-in cooldown. Users can retry as soon as the previous request finishes. Supabase still enforces its configured service limits.

References: https://supabase.com/docs/guides/auth/rate-limits and https://supabase.com/docs/guides/auth/auth-smtp

## Live updates and moderator handoff
Apply `supabase/migrations/0006_live_updates.sql` after migrations 0001–0005. It installs database triggers for room, profile, connection, hand, role, ban and invitation changes, read-only authorization policies for private Realtime channels, and the atomic moderator-claim function. No additional SELECT policies are added to application tables. Keep Supabase Realtime enabled; clients use private channels. Channel payloads contain only an empty change signal; clients retrieve data through authorized APIs.

- Hallway creation, editing and ending updates arrive by push, along with profile photos/names. A 5-second poll reconciles live audience counts and missed broadcasts.
- Room role/hand/invitation/ban changes refresh by push. LiveKit participant/mute/metadata events refresh room state directly. A 2-second poll also runs for connection reconciliation and succession if an event is missed. Lobby, profile, recommendations, connections and invitation pages subscribe to relevant updates, with 15-second fallback refreshes.
- **Leave room running** is available while another panel member remains. The longest-serving connected speaker becomes moderator if no other moderator remains. If the last host, moderator or speaker leaves, the room ends immediately, including when listeners remain. The host's leave dialog explains when leaving ends the room. Explicit leaves, switching rooms, entering a private call, and closing the page notify the server; the connection SID prevents delayed cleanup from removing a newer connection. State/room/hallway reads also reconcile missed disconnects as soon as LiveKit reports them. A newly created room stays open while its host is in the lobby or connecting; service errors never count as an empty panel. Host identity is retained so a returning host can resume a room that is still live.
- Moderator claims save the leadership timestamp and speaker role in one database transaction. Concurrent requests cannot claim the same leadership version. A speaker-to-moderator change keeps the existing audio connection.

Two-account acceptance check after applying the migrations:
1. Change A's photo and choose a username; confirm it persists after refresh and appears for B. Try the same username from B and expect a conflict.
2. Follow each other; confirm each account's lists update. Unfollow, follow again, then remove the other account as a follower; confirm both lists update.
3. Keep B in the hallway while A creates, edits and ends a public room; confirm B updates without a manual reload.
4. Join a room with A hosting and B speaking. A selects Leave room running; confirm B receives moderator controls and can manage hands. Repeat by closing A's tab. Rejoin A, then confirm that an existing connected moderator prevents another automatic promotion.
5. Send B a ping and raise a hand; confirm notification/inbox/stage controls refresh. Join directly from the ping. Repeat with Realtime disconnected to check fallback refreshes.
6. Leave the last panel member with listeners still connected; confirm the room ends for everyone and disappears from Explore. Repeat after switching rooms and closing the panel member's tab. Confirm a fresh room is not ended while its host is connecting.

Local checks: `npm run typecheck`, `npm run build` and `node --test tests/*.test.cjs` (102 checks). On 2026-11-04 the built app was also checked against hosted Supabase/LiveKit with two disposable accounts and a guest: private Realtime ping delivery, invitation acceptance and listener permissions, last-host/last-moderator closing, speaker succession and unexpected-disconnect reconciliation all passed. Test accounts and unlisted rooms were removed afterward. Browser visual/microphone verification is separate.

## Private chat (messages, voice notes, calls)

People who **follow each other** can chat from the **Messages** tab: text, voice messages (up to 3 minutes), and voice or video calls. A conversation stays readable if one person later unfollows, but nobody can send messages or start calls until both follow each other again.

- **Setup:** apply `supabase/migrations/0007_chat.sql` (after 0006). Until then the Messages tab shows a "chat isn't set up yet" message and everything else works as before.
- **Access:** every request goes through `/api/chat/*`, which checks sign-in, conversation membership and the mutual follow. The four chat tables have row-level security on with no policies, so nothing can read them except the server.
- **Live updates:** the database sends an *empty* signal on `airroom:chat:<your id>` (only you may listen to your own channel); the app then re-fetches through the API. No message text is ever broadcast. Polling covers the gaps if Realtime is down.
- **Voice messages:** recorded in the browser (WebM/Opus, or MP4/AAC on iPhone) and stored in the database. Audio is served only to the two people in the conversation, by `/api/chat/media/<id>`.
- **Calls:** a `calls` row is the ringing state; the audio/video itself runs through LiveKit in a private room per call (`call-<id>`). A call rings for 45 seconds, then counts as missed. Connected calls send a heartbeat; if it stops for 45 seconds the call is closed. The result ("Video call · 4:32", "Missed voice call") is added to the conversation. Starting or answering a call leaves any live room you are in.
- **Rules live in** `lib/chat-core.ts` (pure, unit-tested in `tests/chat.test.cjs`); the permission checks are tested against an in-memory database in `tests/chat-api.test.cjs`.
