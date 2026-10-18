-- Bumping session_version invalidates every session cookie issued for that user
-- (password change, admin password reset, "sign out everywhere").
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;

-- Fixed-window counters for failed sign-ins, keyed by "ip:<addr>" or "user:<name>".
CREATE TABLE login_failures (
	key TEXT PRIMARY KEY NOT NULL,
	count INTEGER NOT NULL,
	window_start INTEGER NOT NULL
);

CREATE INDEX idx_login_failures_window_start ON login_failures (window_start);
