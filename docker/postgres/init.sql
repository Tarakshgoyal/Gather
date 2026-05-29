CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  from_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_channel_id_id_idx ON chat_messages (channel_id, id);

CREATE TABLE IF NOT EXISTS realtime_presence (
  employee_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  skin TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  status TEXT NOT NULL,
  meeting_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS realtime_presence_updated_at_idx ON realtime_presence (updated_at);

CREATE TABLE IF NOT EXISTS realtime_signals (
  id BIGSERIAL PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('offer', 'answer', 'ice', 'leave')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS realtime_signals_to_id_id_idx ON realtime_signals (to_id, id);
CREATE INDEX IF NOT EXISTS realtime_signals_created_at_idx ON realtime_signals (created_at);

CREATE TABLE IF NOT EXISTS employee_positions (
  employee_id TEXT PRIMARY KEY,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 160),
  description TEXT NOT NULL DEFAULT '',
  room_id TEXT NOT NULL,
  room_name TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  creator_id TEXT NOT NULL,
  creator_name TEXT NOT NULL,
  live_started_at TIMESTAMPTZ,
  live_ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS calendar_events_start_at_idx ON calendar_events (start_at);
CREATE INDEX IF NOT EXISTS calendar_events_room_id_start_at_idx ON calendar_events (room_id, start_at);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('created', 'day_before', 'hour_before', 'started')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  room_name TEXT NOT NULL,
  event_start_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  UNIQUE (event_id, type)
);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_read_at_created_at_idx ON notifications (read_at, created_at DESC);
