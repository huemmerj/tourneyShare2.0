-- =============================================================================
-- TourneyShare — PostgreSQL Schema
-- Target: Supabase (PostgreSQL 15+)
-- Auth: better-auth (creates its own `user`, `session`, `account` tables)
--       User IDs are type TEXT (better-auth default)
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
  'scheduled',   -- created, not yet started
  'in_progress', -- match has begun
  'completed',   -- result recorded and accepted
  'disputed',    -- score was challenged, awaiting organizer ruling
  'bye'          -- one side auto-advances (odd bracket numbers)
);

CREATE TYPE score_reporter_type AS ENUM (
  'organizer_only',   -- only tournament owner can submit scores
  'any_participant',  -- either participant in the match can submit
  'specific_users'    -- hand-picked list (see round_reporters table)
);

CREATE TYPE dispute_status AS ENUM (
  'pending',            -- opposing side has not responded yet
  'confirmed',          -- opposing side accepted the score
  'disputed',           -- opposing side rejected — awaiting organizer
  'organizer_resolved'  -- organizer made the final call
);

CREATE TYPE bracket_side AS ENUM ('winners', 'losers', 'grand_final');


-- =============================================================================
-- GUEST TOKENS
-- Anonymous participants. Token is stored in the browser (localStorage/cookie)
-- so guests can reclaim their slot after closing the browser.
-- =============================================================================

CREATE TABLE guest_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid       NOT NULL,
  token        text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  display_name text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);


-- =============================================================================
-- TOURNAMENTS
-- =============================================================================

CREATE TABLE tournaments (
  id                    uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              text                NOT NULL,          -- FK → better-auth user.id
  name                  text                NOT NULL,
  description           text,
  sport_type            text,                                  -- free text: "Chess", "Valorant", etc.
  format                tournament_format   NOT NULL,
  participant_type      participant_type     NOT NULL DEFAULT 'solo',
  max_participants      int                 CHECK (max_participants > 1),
  max_team_size         int                 CHECK (max_team_size > 0),  -- only used when participant_type = 'team'
  start_date            timestamptz,
  end_date              timestamptz,
  status                tournament_status   NOT NULL DEFAULT 'draft',
  is_public             bool                NOT NULL DEFAULT false,
  invite_code           text                UNIQUE NOT NULL DEFAULT upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 8)),
  allow_anonymous       bool                NOT NULL DEFAULT false,  -- enables guest join via invite link
  dispute_flow_enabled  bool                NOT NULL DEFAULT false,
  results_visible       bool                NOT NULL DEFAULT true,   -- spectators can see scores while active
  created_at            timestamptz         NOT NULL DEFAULT now(),
  updated_at            timestamptz         NOT NULL DEFAULT now(),

  CONSTRAINT end_after_start CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT team_size_only_for_teams CHECK (
    participant_type = 'team' OR max_team_size IS NULL
  )
);


-- =============================================================================
-- TEAMS
-- Only relevant when tournament.participant_type = 'team'.
-- created_by is the implicit "captain" — display only, no special permissions.
-- =============================================================================

CREATE TABLE teams (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid        NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  logo_url      text,
  created_by    text,       -- FK → better-auth user.id (nullable: creator may delete account)
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_team_name_per_tournament UNIQUE (tournament_id, name)
);


-- =============================================================================
-- TEAM MEMBERS
-- Tracks which users/guests are in which team.
-- Exactly one of user_id or guest_token_id must be set.
-- =============================================================================

CREATE TABLE team_members (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id         text,       -- FK → better-auth user.id
  guest_token_id  uuid        REFERENCES guest_tokens(id) ON DELETE CASCADE,
  display_name    text        NOT NULL,
  joined_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT team_member_identity CHECK (
    (user_id IS NOT NULL AND guest_token_id IS NULL) OR
    (user_id IS NULL AND guest_token_id IS NOT NULL)
  ),
  CONSTRAINT unique_user_per_team UNIQUE (team_id, user_id),
  CONSTRAINT unique_guest_per_team UNIQUE (team_id, guest_token_id)
);


-- =============================================================================
-- PARTICIPANTS
-- Unified representation of a "slot" in a tournament.
-- Exactly one of: user_id, guest_token_id, or team_id must be set.
--   solo + logged-in user  → user_id
--   solo + anonymous guest → guest_token_id
--   team-based             → team_id
-- =============================================================================

CREATE TABLE participants (
  id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid                NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id         text,               -- FK → better-auth user.id
  guest_token_id  uuid                REFERENCES guest_tokens(id) ON DELETE CASCADE,
  team_id         uuid                REFERENCES teams(id) ON DELETE CASCADE,
  seed            int,                -- optional seeding before bracket generation
  status          participant_status  NOT NULL DEFAULT 'pending',
  registered_at   timestamptz         NOT NULL DEFAULT now(),

  CONSTRAINT participant_identity CHECK (
    (user_id IS NOT NULL)::int +
    (guest_token_id IS NOT NULL)::int +
    (team_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT unique_user_per_tournament    UNIQUE (tournament_id, user_id),
  CONSTRAINT unique_guest_per_tournament   UNIQUE (tournament_id, guest_token_id),
  CONSTRAINT unique_team_per_tournament    UNIQUE (tournament_id, team_id)
);


-- =============================================================================
-- ROUND SETTINGS
-- Per-round configuration for score reporting permissions.
-- One row per round per tournament.
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
-- Used when round_settings.score_reporter_type = 'specific_users'.
-- Lists the users who are allowed to report scores for that round.
-- =============================================================================

CREATE TABLE round_reporters (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_setting_id uuid NOT NULL REFERENCES round_settings(id) ON DELETE CASCADE,
  user_id          text NOT NULL,   -- FK → better-auth user.id

  CONSTRAINT unique_reporter_per_round UNIQUE (round_setting_id, user_id)
);


-- =============================================================================
-- MATCHES
-- Covers all formats. Bracket positioning via round_number + match_number.
-- next_winner_match_id → where the winner advances
-- next_loser_match_id  → where the loser goes (double elimination losers bracket)
-- =============================================================================

CREATE TABLE matches (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id         uuid          NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number          int           NOT NULL CHECK (round_number > 0),
  round_label           text,         -- e.g. "Quarter-final", "Group A - Round 2"
  match_number          int           NOT NULL CHECK (match_number > 0),
  bracket               bracket_side  NOT NULL DEFAULT 'winners',
  participant_a_id      uuid          REFERENCES participants(id) ON DELETE SET NULL,
  participant_b_id      uuid          REFERENCES participants(id) ON DELETE SET NULL,
  score_a               int           CHECK (score_a >= 0),
  score_b               int           CHECK (score_b >= 0),
  winner_id             uuid          REFERENCES participants(id) ON DELETE SET NULL,
  next_winner_match_id  uuid          REFERENCES matches(id) ON DELETE SET NULL,
  next_loser_match_id   uuid          REFERENCES matches(id) ON DELETE SET NULL,  -- double elimination only
  scheduled_at          timestamptz,
  status                match_status  NOT NULL DEFAULT 'scheduled',
  -- Who submitted the accepted score
  reported_by_user_id   text,         -- FK → better-auth user.id
  reported_by_guest_id  uuid          REFERENCES guest_tokens(id) ON DELETE SET NULL,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT unique_match_position UNIQUE (tournament_id, bracket, round_number, match_number),
  CONSTRAINT no_self_match CHECK (participant_a_id IS DISTINCT FROM participant_b_id),
  CONSTRAINT winner_is_participant CHECK (
    winner_id IS NULL OR
    winner_id = participant_a_id OR
    winner_id = participant_b_id
  ),
  CONSTRAINT score_complete CHECK (
    (score_a IS NULL AND score_b IS NULL) OR
    (score_a IS NOT NULL AND score_b IS NOT NULL)
  ),
  CONSTRAINT no_tie CHECK (
    score_a IS NULL OR score_b IS NULL OR score_a <> score_b
  )
);


-- =============================================================================
-- SCORE REPORTS
-- Used when dispute_flow_enabled = true on the tournament.
-- Tracks who submitted a score and whether the opposing side confirmed it.
-- Only one score_report per match should be active at a time.
-- =============================================================================

CREATE TABLE score_reports (
  id                       uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                 uuid            NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  score_a                  int             NOT NULL CHECK (score_a >= 0),
  score_b                  int             NOT NULL CHECK (score_b >= 0),
  submitted_by_user_id     text,           -- FK → better-auth user.id
  submitted_by_guest_id    uuid            REFERENCES guest_tokens(id) ON DELETE SET NULL,
  submitted_at             timestamptz     NOT NULL DEFAULT now(),
  -- Response from opposing side
  dispute_status           dispute_status  NOT NULL DEFAULT 'pending',
  responded_by_user_id     text,           -- FK → better-auth user.id
  responded_by_guest_id    uuid            REFERENCES guest_tokens(id) ON DELETE SET NULL,
  responded_at             timestamptz,
  -- Organizer resolution (only when disputed)
  resolved_by              text,           -- FK → better-auth user.id (organizer)
  resolved_at              timestamptz,
  resolution_note          text,

  CONSTRAINT no_tie_report CHECK (score_a <> score_b),
  CONSTRAINT submitter_set CHECK (
    (submitted_by_user_id IS NOT NULL AND submitted_by_guest_id IS NULL) OR
    (submitted_by_user_id IS NULL AND submitted_by_guest_id IS NOT NULL)
  )
);


-- =============================================================================
-- NOTIFICATIONS
-- In-app notification log. Recipients are either registered users or guests.
-- =============================================================================

CREATE TABLE notifications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text,       -- FK → better-auth user.id
  guest_token_id  uuid        REFERENCES guest_tokens(id) ON DELETE CASCADE,
  tournament_id   uuid        REFERENCES tournaments(id) ON DELETE CASCADE,
  match_id        uuid        REFERENCES matches(id) ON DELETE CASCADE,
  type            text        NOT NULL,   -- 'score_submitted' | 'dispute_raised' | 'match_completed' | etc.
  message         text        NOT NULL,
  is_read         bool        NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_recipient CHECK (
    (user_id IS NOT NULL AND guest_token_id IS NULL) OR
    (user_id IS NULL AND guest_token_id IS NOT NULL)
  )
);


-- =============================================================================
-- DEFERRED FOREIGN KEYS
-- better-auth user table is referenced but not owned by us.
-- We add FKs to guest_tokens after the table is created above.
-- =============================================================================

ALTER TABLE guest_tokens
  ADD CONSTRAINT fk_guest_tokens_tournament
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;


-- =============================================================================
-- INDEXES
-- =============================================================================

-- tournaments
CREATE INDEX idx_tournaments_owner       ON tournaments(owner_id);
CREATE INDEX idx_tournaments_status      ON tournaments(status);
CREATE INDEX idx_tournaments_public      ON tournaments(is_public) WHERE is_public = true;
CREATE INDEX idx_tournaments_invite_code ON tournaments(invite_code);

-- teams
CREATE INDEX idx_teams_tournament ON teams(tournament_id);

-- team_members
CREATE INDEX idx_team_members_team  ON team_members(team_id);
CREATE INDEX idx_team_members_user  ON team_members(user_id);
CREATE INDEX idx_team_members_guest ON team_members(guest_token_id);

-- guest_tokens
CREATE INDEX idx_guest_tokens_tournament ON guest_tokens(tournament_id);
CREATE INDEX idx_guest_tokens_token      ON guest_tokens(token);

-- participants
CREATE INDEX idx_participants_tournament ON participants(tournament_id);
CREATE INDEX idx_participants_user       ON participants(user_id);
CREATE INDEX idx_participants_team       ON participants(team_id);
CREATE INDEX idx_participants_status     ON participants(tournament_id, status);

-- round_settings
CREATE INDEX idx_round_settings_tournament ON round_settings(tournament_id);

-- round_reporters
CREATE INDEX idx_round_reporters_setting ON round_reporters(round_setting_id);

-- matches
CREATE INDEX idx_matches_tournament ON matches(tournament_id);
CREATE INDEX idx_matches_round      ON matches(tournament_id, round_number);
CREATE INDEX idx_matches_status     ON matches(tournament_id, status);

-- score_reports
CREATE INDEX idx_score_reports_match  ON score_reports(match_id);
CREATE INDEX idx_score_reports_status ON score_reports(match_id, dispute_status);

-- notifications
CREATE INDEX idx_notifications_user  ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_guest ON notifications(guest_token_id, is_read);


-- =============================================================================
-- AUTO-UPDATE updated_at
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
-- ROW LEVEL SECURITY (RLS) — stubs
-- Enable RLS on all tables. Policies to be defined per-feature in Phase 2.
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

-- Public read policy for tournaments marked as public
CREATE POLICY "public tournaments are visible to everyone"
  ON tournaments FOR SELECT
  USING (is_public = true);

-- Owners can do everything on their tournaments
CREATE POLICY "owners manage their tournaments"
  ON tournaments FOR ALL
  USING (owner_id = auth.uid()::text)
  WITH CHECK (owner_id = auth.uid()::text);

-- Spectators can read matches for public tournaments
CREATE POLICY "matches on public tournaments are visible"
  ON matches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = matches.tournament_id
        AND t.is_public = true
    )
  );
