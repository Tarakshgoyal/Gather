import { readFile } from "node:fs/promises";
import { Pool } from "pg";

async function readEnv() {
  const text = await readFile(".env.local", "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return env;
}

const env = await readEnv();
const sourceUrl = env.LOCAL_DATABASE_URL;
const targetUrl = env.DATABASE_URL;

if (!sourceUrl || !targetUrl) {
  throw new Error("LOCAL_DATABASE_URL and DATABASE_URL are required in .env.local");
}

const source = new Pool({ connectionString: sourceUrl });
const target = new Pool({ connectionString: targetUrl, ssl: { rejectUnauthorized: false } });

const schema = `
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
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS live_ended_at TIMESTAMPTZ;
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
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_read_at_created_at_idx ON notifications (read_at, created_at DESC);
`;

const tables = [
  {
    name: "chat_messages",
    key: "id",
    columns: ["id", "channel_id", "from_id", "from_name", "body", "created_at"],
    sequence: "chat_messages_id_seq",
  },
  {
    name: "employee_positions",
    key: "employee_id",
    columns: ["employee_id", "x", "y", "updated_at"],
  },
  {
    name: "calendar_events",
    key: "id",
    columns: ["id", "title", "description", "room_id", "room_name", "start_at", "end_at", "creator_id", "creator_name", "live_started_at", "live_ended_at", "created_at"],
    sequence: "calendar_events_id_seq",
  },
  {
    name: "notifications",
    key: "id",
    columns: ["id", "event_id", "type", "title", "body", "room_name", "event_start_at", "created_at", "read_at"],
    sequence: "notifications_id_seq",
  },
  {
    name: "realtime_presence",
    key: "employee_id",
    columns: ["employee_id", "name", "skin", "x", "y", "status", "meeting_id", "updated_at"],
  },
  {
    name: "realtime_signals",
    key: "id",
    columns: ["id", "from_id", "to_id", "meeting_id", "kind", "payload", "created_at"],
    sequence: "realtime_signals_id_seq",
    map(row) {
      return { ...row, payload: JSON.stringify(row.payload ?? {}) };
    },
  },
];

function quote(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

async function copyTable(table) {
  const rows = (await source.query(`SELECT ${table.columns.map(quote).join(", ")} FROM ${quote(table.name)} ORDER BY ${quote(table.key)} ASC`)).rows;
  if (!rows.length) return 0;

  const updateColumns = table.columns.filter((column) => column !== table.key);
  const insertColumns = table.columns.map(quote).join(", ");
  const values = table.columns.map((_, index) => `$${index + 1}`).join(", ");
  const updates = updateColumns.map((column) => `${quote(column)} = EXCLUDED.${quote(column)}`).join(", ");
  const sql = `INSERT INTO ${quote(table.name)} (${insertColumns}) VALUES (${values}) ON CONFLICT (${quote(table.key)}) DO UPDATE SET ${updates}`;

  for (const originalRow of rows) {
    const row = table.map ? table.map(originalRow) : originalRow;
    await target.query(sql, table.columns.map((column) => row[column]));
  }

  if (table.sequence) {
    await target.query(`SELECT setval($1::regclass, COALESCE((SELECT MAX(${quote(table.key)}) FROM ${quote(table.name)}), 1), true)`, [table.sequence]);
  }

  return rows.length;
}

try {
  await target.query(schema);
  const summary = {};
  for (const table of tables) {
    summary[table.name] = await copyTable(table);
  }
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await source.end();
  await target.end();
}
