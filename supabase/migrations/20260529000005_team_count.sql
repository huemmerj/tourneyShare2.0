-- Add team_count column to tournaments table
-- This allows specifying the number of teams instead of team size
ALTER TABLE tournaments
ADD COLUMN team_count int CHECK (team_count > 0);

-- Add constraint: team_count is only valid for team tournaments
ALTER TABLE tournaments
ADD CONSTRAINT team_count_only_for_teams
CHECK (participant_type = 'team' OR team_count IS NULL);