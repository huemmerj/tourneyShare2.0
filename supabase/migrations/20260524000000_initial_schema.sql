-- =============================================================================
-- TourneyShare — Initial Schema
-- Migration: 20260524000000_initial_schema
-- =============================================================================
-- NOTE: This project uses better-auth, NOT Supabase Auth.
-- better-auth manages its own `user`, `session`, `account` tables in the
-- public schema. User IDs are type TEXT (not UUID).
--
-- RLS policies use current_setting('app.current_user_id', true) instead of
-- auth.uid(). The Next.js server sets this via a Supabase RPC call before
-- any user-scoped query. Public/read-only data uses the anon role directly.
-- =============================================================================


-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE tournament_format AS ENUM (
  'single_elimination',
  'double_elimination',
  'round_robin',
  'swiss'
);

CREATE TYPE tournament_status AS ENUM (
  'draft',         -- being set up, not yet open
  'registration',  -- open for participants to join
  'active',        -- matches are being played
  'completed',     -- all matches done
  'cancelled'
);

CREATE TYPE participant_type AS ENUM ('solo', 'team');

CREATE TYPE participant_status AS ENUM (
  'pending',    -- registered, waiting for organizer confirmation
  'confirmed',  -- organizer accepted
  'eliminated', -- knocked out (elimination formats)
  'active'      -- still in the tournament
);

CREATE TYPE match_status AS ENUM (
  'scheduled',
  'in_progress',
  'completed',
  'disputed',
  'bye'
);

CREATE TYPE score_reporter_type AS ENUM (
  'organizer_only',
  'any_participant',
  'specific_users'
);

CREATE TYPE dispute_status AS ENUM (
  'pending',
  'confirmed',
  'disputed',
  'organizer_resolved'
);

CREATE TYPE bracket_side AS ENUM ('winners', 'losers', 'grand_final');


-- =============================================================================
-- HELPER: get the current user ID set by the server before each query
-- =============================================================================

CREATE OR REPLACE FUNCTION current_user_id()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT current_setting('app.current_user_id', true);
$$;


-- =============================================================================
-- GUEST TOKENS
-- Anonymous participants. Token stored in browser localStorage/cookie.
-- Guest can reclaim their slot by presenting the same token.
-- =============================================================================

CREATE TABLE guest_tokens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid        NOT NULL,   -- FK added below (circular dep)
  token         text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  display_name  text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);


-- =============================================================================
-- TOURNAMENTS
-- =============================================================================

CREATE TABLE tournaments (
  id                   uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             text               NOT NULL,   -- better-auth user.id
  name                 text               NOT NULL,
  description          text,
  sport_type           text,
  format               tournament_format  NOT NULL,
  participant_type     participant_type   NOT NULL DEFAULT 'solo',
  max_participants     int                CHECK (max_participants > 1),
  max_team_size        int                CHECK (max_team_size > 0),
  start_date           timestamptz,
  end_date             timestamptz,
  status               tournament_status  NOT NULL DEFAULT 'draft',
  is_public            bool               NOT NULL DEFAULT false,
  invite_code          text               UNIQUE NOT NULL
                         DEFAULT upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 8)),
  allow_anonymous      bool               NOT NULL DEFAULT false,
  dispute_flow_enabled bool               NOT NULL DEFAULT false,
  results_visible      bool               NOT NULL DEFAULT true,
  created_at           timestamptz        NOT NULL DEFAULT now(),
  updated_at           timestamptz        NOT NULL DEFAULT now(),

  CONSTRAINT end_after_start CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  ),
  CONSTRAINT team_size_only_for_teams CHECK (
    participant_type = 'team' OR max_team_size IS NULL
  )
);

ALTER TABLE guest_tokens
  ADD CONSTRAINT fk_guest_tokens_tournament
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;


-- =============================================================================
-- TEAMS
-- =============================================================================

CREATE TABLE teams (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid        NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  logo_url      text,
  created_by    text,       -- better-auth user.id; nullable (account may be deleted)
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_team_name_per_tournament UNIQUE (tournament_id, name)
);


-- =============================================================================
-- TEAM MEMBERS
-- Exactly one of user_id / guest_token_id must be set.
-- =============================================================================

CREATE TABLE team_members (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        uuid        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id        text,       -- better-auth user.id
  guest_token_id uuid        REFERENCES guest_tokens(id) ON DELETE CASCADE,
  display_name   text        NOT NULL,
  joined_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT team_member_identity CHECK (
    (user_id IS NOT NULL AND guest_token_id IS NULL) OR
    (user_id IS NULL AND guest_token_id IS NOT NULL)
  ),
  CONSTRAINT unique_user_per_team  UNIQUE (team_id, user_id),
  CONSTRAINT unique_guest_per_team UNIQUE (team_id, guest_token_id)
);


-- =============================================================================
-- PARTICIPANTS
-- Unified slot: exactly one of user_id, guest_token_id, or team_id must be set.
-- =============================================================================

CREATE TABLE participants (
  id             uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid               NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id        text,              -- better-auth user.id
  guest_token_id uuid               REFERENCES guest_tokens(id) ON DELETE CASCADE,
  team_id        uuid               REFERENCES teams(id) ON DELETE CASCADE,
  seed           int,
  status         participant_status NOT NULL DEFAULT 'pending',
  registered_at  timestamptz        NOT NULL DEFAULT now(),

  CONSTRAINT participant_identity CHECK (
    (user_id IS NOT NULL)::int +
    (guest_token_id IS NOT NULL)::int +
    (team_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT unique_user_per_tournament  UNIQUE (tournament_id, user_id),
  CONSTRAINT unique_guest_per_tournament UNIQUE (tournament_id, guest_token_id),
  CONSTRAINT unique_team_per_tournament  UNIQUE (tournament_id, team_id)
);


-- =============================================================================
-- ROUND SETTINGS
-- Per-round score reporting configuration.
-- =============================================================================

CREATE TABLE round_settings (
  id                  uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id       uuid                NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number        int                 NOT NULL CHECK (round_number > 0),
  score_reporter_type score_reporter_type NOT NULL DEFAULT 'organizer_only',

  CONSTRAINT unique_round_per_tournament UNIQUE (tournament_id, round_number)
);


-- =============================================================================
-- ROUND REPORTERS
-- Used when score_reporter_type = 'specific_users'.
-- =============================================================================

CREATE TABLE round_reporters (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_setting_id uuid NOT NULL REFERENCES round_settings(id) ON DELETE CASCADE,
  user_id          text NOT NULL,  -- better-auth user.id

  CONSTRAINT unique_reporter_per_round UNIQUE (round_setting_id, user_id)
);


-- =============================================================================
-- MATCHES
-- =============================================================================

CREATE TABLE matches (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id        uuid         NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number         int          NOT NULL CHECK (round_number > 0),
  round_label          text,
  match_number         int          NOT NULL CHECK (match_number > 0),
  bracket              bracket_side NOT NULL DEFAULT 'winners',
  participant_a_id     uuid         REFERENCES participants(id) ON DELETE SET NULL,
  participant_b_id     uuid         REFERENCES participants(id) ON DELETE SET NULL,
  score_a              int          CHECK (score_a >= 0),
  score_b              int          CHECK (score_b >= 0),
  winner_id            uuid         REFERENCES participants(id) ON DELETE SET NULL,
  next_winner_match_id uuid         REFERENCES matches(id) ON DELETE SET NULL,
  next_loser_match_id  uuid         REFERENCES matches(id) ON DELETE SET NULL,
  scheduled_at         timestamptz,
  status               match_status NOT NULL DEFAULT 'scheduled',
  reported_by_user_id  text,        -- better-auth user.id
  reported_by_guest_id uuid         REFERENCES guest_tokens(id) ON DELETE SET NULL,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT unique_match_position UNIQUE (tournament_id, bracket, round_number, match_number),
  CONSTRAINT no_self_match CHECK (
    participant_a_id IS NULL OR
    participant_b_id IS NULL OR
    participant_a_id <> participant_b_id
  ),
  CONSTRAINT winner_is_participant CHECK (
    winner_id IS NULL OR
    winner_id = participant_a_id OR
    winner_id = participant_b_id
  ),
  CONSTRAINT score_both_or_neither CHECK (
    (score_a IS NULL AND score_b IS NULL) OR
    (score_a IS NOT NULL AND score_b IS NOT NULL)
  ),
  CONSTRAINT no_tie CHECK (
    score_a IS NULL OR score_b IS NULL OR score_a <> score_b
  )
);


-- =============================================================================
-- SCORE REPORTS
-- =============================================================================

CREATE TABLE score_reports (
  id                    uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id              uuid           NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  score_a               int            NOT NULL CHECK (score_a >= 0),
  score_b               int            NOT NULL CHECK (score_b >= 0),
  submitted_by_user_id  text,          -- better-auth user.id
  submitted_by_guest_id uuid           REFERENCES guest_tokens(id) ON DELETE SET NULL,
  submitted_at          timestamptz    NOT NULL DEFAULT now(),
  dispute_status        dispute_status NOT NULL DEFAULT 'pending',
  responded_by_user_id  text,          -- better-auth user.id
  responded_by_guest_id uuid           REFERENCES guest_tokens(id) ON DELETE SET NULL,
  responded_at          timestamptz,
  resolved_by           text,          -- better-auth user.id (organizer)
  resolved_at           timestamptz,
  resolution_note       text,

  CONSTRAINT no_tie_report CHECK (score_a <> score_b),
  CONSTRAINT submitter_set CHECK (
    (submitted_by_user_id IS NOT NULL AND submitted_by_guest_id IS NULL) OR
    (submitted_by_user_id IS NULL AND submitted_by_guest_id IS NOT NULL)
  )
);


-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================

CREATE TABLE notifications (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text,       -- better-auth user.id
  guest_token_id uuid        REFERENCES guest_tokens(id) ON DELETE CASCADE,
  tournament_id  uuid        REFERENCES tournaments(id) ON DELETE CASCADE,
  match_id       uuid        REFERENCES matches(id) ON DELETE CASCADE,
  type           text        NOT NULL,
  message        text        NOT NULL,
  is_read        bool        NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_recipient CHECK (
    (user_id IS NOT NULL AND guest_token_id IS NULL) OR
    (user_id IS NULL AND guest_token_id IS NOT NULL)
  )
);


-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_tournaments_owner       ON tournaments(owner_id);
CREATE INDEX idx_tournaments_status      ON tournaments(status);
CREATE INDEX idx_tournaments_public      ON tournaments(is_public) WHERE is_public = true;
CREATE INDEX idx_tournaments_invite_code ON tournaments(invite_code);

CREATE INDEX idx_teams_tournament ON teams(tournament_id);

CREATE INDEX idx_team_members_team  ON team_members(team_id);
CREATE INDEX idx_team_members_user  ON team_members(user_id);
CREATE INDEX idx_team_members_guest ON team_members(guest_token_id);

CREATE INDEX idx_guest_tokens_tournament ON guest_tokens(tournament_id);
CREATE INDEX idx_guest_tokens_token      ON guest_tokens(token);

CREATE INDEX idx_participants_tournament ON participants(tournament_id);
CREATE INDEX idx_participants_user       ON participants(user_id);
CREATE INDEX idx_participants_team       ON participants(team_id);
CREATE INDEX idx_participants_status     ON participants(tournament_id, status);

CREATE INDEX idx_round_settings_tournament ON round_settings(tournament_id);
CREATE INDEX idx_round_reporters_setting   ON round_reporters(round_setting_id);

CREATE INDEX idx_matches_tournament ON matches(tournament_id);
CREATE INDEX idx_matches_round      ON matches(tournament_id, round_number);
CREATE INDEX idx_matches_status     ON matches(tournament_id, status);

CREATE INDEX idx_score_reports_match  ON score_reports(match_id);
CREATE INDEX idx_score_reports_status ON score_reports(match_id, dispute_status);

CREATE INDEX idx_notifications_user  ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_guest ON notifications(guest_token_id, is_read);


-- =============================================================================
-- TRIGGERS: auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tournaments_updated_at
  BEFORE UPDATE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- ROW LEVEL SECURITY
-- We use current_setting('app.current_user_id', true) instead of auth.uid()
-- because better-auth does not use Supabase Auth.
-- The Next.js server calls `SELECT set_config('app.current_user_id', $id, true)`
-- at the start of each authenticated request before any RLS-protected query.
-- =============================================================================

ALTER TABLE tournaments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams          ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_reporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  ENABLE ROW LEVEL SECURITY;

-- Public tournaments: anyone (anon) can read
CREATE POLICY "public tournaments readable by all"
  ON tournaments FOR SELECT
  USING (is_public = true);

-- Tournament owners: full access to their own tournaments
CREATE POLICY "owners have full access to their tournaments"
  ON tournaments FOR ALL
  USING  (owner_id = current_user_id())
  WITH CHECK (owner_id = current_user_id());

-- Matches on public tournaments: readable by anyone
CREATE POLICY "matches on public tournaments are readable"
  ON matches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = matches.tournament_id AND t.is_public = true
    )
  );

-- Full per-table RLS policies will be added in Phase 2 alongside
-- the better-auth session middleware integration.
