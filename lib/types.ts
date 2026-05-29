export type TournamentFormat =
  | "single_elimination"
  | "double_elimination"
  | "round_robin"
  | "swiss";

export type ParticipantType = "solo" | "team";

export type TournamentStatus =
  | "draft"
  | "registration"
  | "active"
  | "completed"
  | "cancelled";

export type ParticipantStatus = "pending" | "confirmed" | "eliminated" | "active";

export type Tournament = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  sport_type: string | null;
  format: TournamentFormat;
  participant_type: ParticipantType;
  max_participants: number | null;
  max_team_size: number | null;
  start_date: string | null;
  end_date: string | null;
  status: TournamentStatus;
  is_public: boolean;
  invite_code: string;
  allow_anonymous: boolean;
  dispute_flow_enabled: boolean;
  results_visible: boolean;
  scoring_rule: "higher_wins" | "lower_wins";
  created_at: string;
  updated_at: string;
};

export type Participant = {
  id: string;
  tournament_id: string;
  user_id: string | null;
  guest_token_id: string | null;
  team_id: string | null;
  seed: number | null;
  status: ParticipantStatus;
  registered_at: string;
};

export type GuestToken = {
  id: string;
  tournament_id: string;
  token: string;
  display_name: string;
  created_at: string;
  last_seen_at: string;
};
