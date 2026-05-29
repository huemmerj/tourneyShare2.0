-- Team registration mode for team tournaments
-- 'self_select': players join/create teams themselves (current default)
-- 'admin_assigned': players register first, admin assigns them to teams afterwards
ALTER TABLE tournaments
  ADD COLUMN team_mode text NOT NULL DEFAULT 'self_select'
  CHECK (team_mode IN ('self_select', 'admin_assigned'));
