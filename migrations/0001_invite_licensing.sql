PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS invite_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  batch_name TEXT NOT NULL DEFAULT '默认批次',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'exhausted')),
  max_devices INTEGER NOT NULL DEFAULT 2 CHECK (max_devices > 0),
  activation_count INTEGER NOT NULL DEFAULT 0 CHECK (activation_count >= 0),
  max_interviews INTEGER NOT NULL DEFAULT 10 CHECK (max_interviews > 0),
  interviews_used INTEGER NOT NULL DEFAULT 0 CHECK (interviews_used >= 0),
  access_days INTEGER NOT NULL DEFAULT 30 CHECK (access_days > 0),
  first_activated_at TEXT,
  access_expires_at TEXT,
  code_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS invite_codes_status_idx ON invite_codes(status);
CREATE INDEX IF NOT EXISTS invite_codes_batch_idx ON invite_codes(batch_name);
CREATE INDEX IF NOT EXISTS invite_codes_created_idx ON invite_codes(created_at DESC);

CREATE TABLE IF NOT EXISTS activations (
  id TEXT PRIMARY KEY,
  invite_code_id TEXT NOT NULL REFERENCES invite_codes(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS activations_code_idx ON activations(invite_code_id);
CREATE INDEX IF NOT EXISTS activations_token_idx ON activations(token_hash);

CREATE TABLE IF NOT EXISTS interview_usage (
  session_key TEXT PRIMARY KEY,
  invite_code_id TEXT NOT NULL REFERENCES invite_codes(id) ON DELETE CASCADE,
  activation_id TEXT NOT NULL REFERENCES activations(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS interview_usage_code_idx ON interview_usage(invite_code_id);

CREATE TABLE IF NOT EXISTS redeem_attempts (
  ip_hash TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  blocked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS validate_activation_before_insert
BEFORE INSERT ON activations
BEGIN
  SELECT RAISE(ABORT, 'INVITE_UNAVAILABLE') WHERE NOT EXISTS (
    SELECT 1 FROM invite_codes
    WHERE id = NEW.invite_code_id
      AND status = 'active'
      AND activation_count < max_devices
      AND (code_expires_at IS NULL OR datetime(code_expires_at) > CURRENT_TIMESTAMP)
      AND (access_expires_at IS NULL OR datetime(access_expires_at) > CURRENT_TIMESTAMP)
      AND interviews_used < max_interviews
  );
END;

CREATE TRIGGER IF NOT EXISTS update_invite_after_activation
AFTER INSERT ON activations
BEGIN
  UPDATE invite_codes
  SET activation_count = activation_count + 1,
      first_activated_at = COALESCE(first_activated_at, CURRENT_TIMESTAMP),
      access_expires_at = COALESCE(access_expires_at, datetime('now', '+' || access_days || ' days')),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.invite_code_id;
END;

CREATE TRIGGER IF NOT EXISTS validate_interview_before_insert
BEFORE INSERT ON interview_usage
BEGIN
  SELECT RAISE(ABORT, 'INTERVIEW_LIMIT_REACHED') WHERE NOT EXISTS (
    SELECT 1
    FROM activations a
    JOIN invite_codes c ON c.id = a.invite_code_id
    WHERE a.id = NEW.activation_id
      AND a.invite_code_id = NEW.invite_code_id
      AND a.revoked_at IS NULL
      AND c.status = 'active'
      AND c.interviews_used < c.max_interviews
      AND (c.access_expires_at IS NULL OR datetime(c.access_expires_at) > CURRENT_TIMESTAMP)
  );
END;

CREATE TRIGGER IF NOT EXISTS update_invite_after_interview
AFTER INSERT ON interview_usage
BEGIN
  UPDATE invite_codes
  SET interviews_used = interviews_used + 1,
      status = IIF(interviews_used + 1 >= max_interviews, 'exhausted', status),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.invite_code_id;
END;
