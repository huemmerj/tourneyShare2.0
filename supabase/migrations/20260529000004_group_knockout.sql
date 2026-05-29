-- Add group_knockout to the tournament_format enum
ALTER TYPE tournament_format ADD VALUE IF NOT EXISTS 'group_knockout';

-- Add group configuration columns for group_knockout format
ALTER TABLE tournaments
  ADD COLUMN group_count int CHECK (group_count > 0),
  ADD COLUMN advance_per_group int CHECK (advance_per_group > 0);
