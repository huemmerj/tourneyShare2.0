-- Add scoring rule to tournaments: 'higher_wins' (default) or 'lower_wins'
ALTER TABLE tournaments
  ADD COLUMN scoring_rule text NOT NULL DEFAULT 'higher_wins'
  CHECK (scoring_rule IN ('higher_wins', 'lower_wins'));
