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
POST /api/rooms/[slug]/leave         host. {mode:'end'|'transfer', newHostId?}
POST /api/rooms/[slug]/end           host. status ended, closeRoom, revoke pending invites
POST /api/rooms/[slug]/report        anyone signed-in. {reason,details,targetUserId?}
GET/POST /api/me                     user. GET profile; POST {display_name}

Moderate rules: invite (target must have pending hand or be listener; creates stage_invitation, marks hand invited; not for banned/guest);
mute (speaker/mod target; muteParticipant only, role unchanged); to_audience (role listener, setParticipantRole, not host);
remove (ban insert + kick + role reset + log); appoint_mod/remove_mod/transfer_host host only; pause/resume_hands mod.
Succession: GET state also promotes. If no host/moderator has been connected for 30s and a speaker is on stage, the longest-serving connected speaker becomes moderator (logged as auto_promote_mod; rooms.leader_seen_at, migration 0003). The returning host regains host automatically.
Every action calls logAction. Moderators cannot act on host; mods cannot act on other mods except host.
