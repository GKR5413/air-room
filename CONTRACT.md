# API contract (all JSON; Bearer token = Supabase access token; guests use ar_guest cookie)
Helpers in lib/: auth.ts (route, getUser, requireUser, getIdentity, withGuestCookie, fail), rooms.ts, livekit.ts, types.ts.
Use `route(async (req, {params}) => ...)`; params is a Promise in Next 15: `const { slug } = await params`.

GET  /api/rooms                      -> { rooms: [{slug,title,topic,language,host_name,audience}] } live + public only
POST /api/rooms                      user. body {title,description,topic,language,visibility,hands_enabled} -> {slug}; status live; host membership
GET  /api/rooms/[slug]               public info -> {room, host_name, status}
PATCH /api/rooms/[slug]              host. edit title/description/topic/language/hands_enabled
POST /api/rooms/[slug]/join          anyone (guest ok). 410 if ended, 403 if banned. -> JoinResponse. Persist role; listener->membership row for users
GET  /api/rooms/[slug]/state         anyone joined -> RoomState (poll every 2s). hands only for mods. stage built from memberships role!=listener that are connected in LiveKit
POST /api/rooms/[slug]/hand          user. {action:'raise'|'lower'}. raise needs hands_enabled, one pending
POST /api/rooms/[slug]/invitation    user. {action:'accept'|'decline', id}. accept: must be pending+room live+not banned; set role speaker, setParticipantRole; client then re-calls join for fresh token
POST /api/rooms/[slug]/moderate      mod. {action:ModAction, target?:userId}. see rules below
POST /api/rooms/[slug]/leave         host. {mode:'auto'|'end'|'transfer', newHostId?}
POST /api/rooms/[slug]/depart        own identity (guest ok). {participantSid}. Remove only the matching live connection; end if the panel is now empty, otherwise preserve moderation. Used for leave, room switch, call switch and pagehide.
POST /api/rooms/[slug]/end           host. status ended, closeRoom, revoke pending invites
POST /api/rooms/[slug]/report        anyone signed-in. {reason,details,targetUserId?}
GET/POST /api/me                     user. GET profile; POST {display_name, username?, avatar_url?}. Username normalized lowercase, 3–24 [a-z0-9_], conflict 409. avatar_url: null or PNG/JPEG/WebP base64 data URL (max 700000 characters).
GET /api/people                     user. ?q=username prefix -> {people:[{id,display_name,username,avatar_url}],followerIds,followingIds}; no q lists connections (up to 100 profiles).
GET /api/people/recommended        user. -> {recommendations:[{id,display_name,username,avatar_url,reason,mutuals}]} (max 8). Ranked from existing users: follows you > mutual connections (people you follow follow them) > shared rooms > popularity > newest. Excludes you, people you follow, and blocks either way. reason: follows_you|mutual|same_room|popular|new.
POST /api/people/[id]               user. {action:'follow'|'unfollow'|'remove_follower'}. Follow/unfollow outgoing connection; remove_follower deletes only target→current-user. Self connections rejected.

Moderate rules: invite (target must have pending hand or be listener; creates stage_invitation, marks hand invited; not for banned/guest);
mute (speaker/mod target; muteParticipant only, role unchanged); to_audience (role listener, setParticipantRole, not host);
remove (ban insert + kick + role reset + log); appoint_mod/remove_mod/transfer_host host only; pause/resume_hands mod.
Lifecycle: room/state/hallway/join reads and explicit departures reconcile LiveKit connections with durable panel roles. If no connected host/moderator/speaker remains in a started room, it ends immediately, even with listeners present. New rooms remain live while awaiting their first panel connection. LiveKit service failures are not treated as empty rooms. Network loss detection depends on LiveKit. If a speaker remains without a moderator, the longest-serving speaker is promoted without an application grace period via atomic claim_room_moderator (migrations 0003 + 0006). POST leave mode auto removes the host first and ends the room when no panel remains. Host transfers require a connected recipient. Returning hosts retain privileges only while the room is live.
Every action calls logAction. Moderators cannot act on host; mods cannot act on other mods except host.

Room friend invitations (migration 0005; separate from stage invitations):
GET /api/rooms/[slug]/friends        signed-in room member, live and not banned. ?page=0 (50/page) -> {friends:[{id,display_name,username,avatar_url,invited}],hasMore}. Friends = people the current user follows; banned recipients omitted.
POST /api/rooms/[slug]/friends       same access. {recipientId}. Must follow recipient; no self/banned invites. Persisted once per room/recipient, repeated requests idempotent.
GET /api/invitations                 user. -> {invitations:[{id,created_at,room:{id,slug,title},sender:{id,display_name,avatar_url}}]}. Own pending invites for live, accessible rooms only.
POST /api/invitations/[id]           recipient only. {action:'accept'|'dismiss'}. Accept checks room live and bans and returns {ok,slug}. The client starts its persistent room session and navigates straight to the live room, calling the normal /join endpoint. Does not grant publishing rights or bypass join checks. Dismiss returns {ok}. Cancelling a room switch does not accept the invite. Shared inbox powers in-app pings, the Invitations page and navigation count.

Live updates (migration 0006): private Supabase Realtime broadcast topics airroom:hallway, airroom:profiles, airroom:room:<slug>, airroom:user:<authenticated UUID>. Broadcast event `change` carries an empty payload; consumers re-fetch API state. Personal topics are restricted to auth.uid(); room invalidation topics are accessible by the existing shareable slug. No client send policies. Room-state fallback is 2s, hallway and room invitations are 5s, other views 15s. Leader timestamp bookkeeping is excluded from room broadcasts to avoid refresh loops.
