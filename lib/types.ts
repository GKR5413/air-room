export type Role = 'host' | 'moderator' | 'speaker' | 'listener';
export type Visibility = 'public' | 'unlisted';
export type RoomStatus = 'live' | 'ended';

export interface RoomRow {
  id: string; slug: string; host_id: string; title: string; description: string;
  topic: string; language: string; visibility: Visibility; status: RoomStatus;
  hands_enabled: boolean; created_at: string; ended_at: string | null;
}

export interface Identity { id: string; name: string; isGuest: boolean }

export interface JoinResponse { token: string; url: string; role: Role }

export interface StageMember { id: string; name: string; role: Role; muted: boolean; speaking: boolean }

export interface RoomState {
  room: { slug: string; title: string; description: string; topic: string; language: string;
          visibility: Visibility; status: RoomStatus; hands_enabled: boolean; host_name: string };
  me: { id: string; role: Role; isGuest: boolean; handPending: boolean; invitationId: string | null };
  stage: StageMember[];
  audienceCount: number;
  hands: { userId: string; name: string; createdAt: string }[]; // only for host/moderator, else []
}

export type ModAction =
  | 'invite' | 'dismiss_hand' | 'mute' | 'to_audience' | 'remove'
  | 'appoint_mod' | 'remove_mod' | 'transfer_host' | 'pause_hands' | 'resume_hands';
