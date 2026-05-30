-- Fix no_self_match constraint to allow both-null (TBD future-round slots)
-- IS DISTINCT FROM returns FALSE when both are NULL, rejecting valid placeholder matches.
ALTER TABLE matches DROP CONSTRAINT no_self_match;
ALTER TABLE matches ADD CONSTRAINT no_self_match CHECK (
  participant_a_id IS NULL OR
  participant_b_id IS NULL OR
  participant_a_id <> participant_b_id
);
