import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import type { AuthUser } from "./auth";

const globalStore = globalThis as typeof globalThis & {
  gatherPgPool?: Pool;
  gatherDbReady?: Promise<void>;
};

export type StoredChatMessage = {
  id: number;
  officeId: string;
  channelId: string;
  fromId: string;
  fromName: string;
  body: string;
  createdAt: number;
};

export type StoredPresence = {
  id: string;
  officeId?: string;
  name: string;
  skin: string;
  position: { x: number; y: number };
  status: string;
  meetingId: string | null;
  updatedAt: number;
};

export type StoredSignalMessage = {
  id: number;
  from: string;
  to: string;
  meetingId: string;
  kind: "offer" | "answer" | "ice" | "leave";
  payload: unknown;
  createdAt: number;
};

export type StoredCalendarEvent = {
  id: number;
  officeId: string;
  title: string;
  description: string;
  mom: string;
  roomId: string;
  roomName: string;
  startAt: string;
  endAt: string;
  creatorId: string;
  creatorName: string;
  liveStartedAt: string | null;
  liveEndedAt: string | null;
  createdAt: string;
};

export type StoredNotification = {
  id: number;
  officeId: string;
  eventId: number;
  type: "created" | "day_before" | "hour_before" | "started";
  title: string;
  body: string;
  roomName: string;
  eventStartAt: string;
  createdAt: string;
  readAt: string | null;
};

export type StoredAuthUser = AuthUser & {
  passwordHash: string;
};

export type StoredOffice = {
  id: string;
  code: string;
  name: string;
  creatorId: string;
  role: "owner" | "member";
  createdAt: string;
};

const DEFAULT_OFFICE_ID = "default";

export function getPool() {
  if (!process.env.DATABASE_URL) return null;
  const databaseUrl = process.env.DATABASE_URL;
  const usesLocalDatabase = /@(localhost|127\.0\.0\.1)(:|\/)/.test(databaseUrl);
  globalStore.gatherPgPool ??= new Pool({
    connectionString: databaseUrl,
    ssl: usesLocalDatabase ? undefined : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  return globalStore.gatherPgPool;
}

export async function ensureDatabase() {
  const pool = getPool();
  if (!pool) return;

  globalStore.gatherDbReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      office_id TEXT NOT NULL DEFAULT 'default',
      channel_id TEXT NOT NULL,
      from_id TEXT NOT NULL,
      from_name TEXT NOT NULL,
      body TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 2000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS office_id TEXT NOT NULL DEFAULT 'default';

    CREATE INDEX IF NOT EXISTS chat_messages_office_channel_id_id_idx
      ON chat_messages (office_id, channel_id, id);

    CREATE TABLE IF NOT EXISTS employee_positions (
      employee_id TEXT PRIMARY KEY,
      office_id TEXT NOT NULL DEFAULT 'default',
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE employee_positions
      ADD COLUMN IF NOT EXISTS office_id TEXT NOT NULL DEFAULT 'default';

    CREATE TABLE IF NOT EXISTS realtime_presence (
      employee_id TEXT PRIMARY KEY,
      office_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      skin TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      status TEXT NOT NULL,
      meeting_id TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE realtime_presence
      ADD COLUMN IF NOT EXISTS office_id TEXT NOT NULL DEFAULT 'default';

    CREATE INDEX IF NOT EXISTS realtime_presence_updated_at_idx
      ON realtime_presence (updated_at);

    CREATE INDEX IF NOT EXISTS realtime_presence_office_updated_at_idx
      ON realtime_presence (office_id, updated_at);

    CREATE TABLE IF NOT EXISTS realtime_signals (
      id BIGSERIAL PRIMARY KEY,
      office_id TEXT NOT NULL DEFAULT 'default',
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      meeting_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('offer', 'answer', 'ice', 'leave')),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE realtime_signals
      ADD COLUMN IF NOT EXISTS office_id TEXT NOT NULL DEFAULT 'default';

    CREATE INDEX IF NOT EXISTS realtime_signals_to_id_id_idx
      ON realtime_signals (to_id, id);

    CREATE INDEX IF NOT EXISTS realtime_signals_office_to_id_id_idx
      ON realtime_signals (office_id, to_id, id);

    CREATE INDEX IF NOT EXISTS realtime_signals_created_at_idx
      ON realtime_signals (created_at);

    CREATE TABLE IF NOT EXISTS calendar_events (
      id BIGSERIAL PRIMARY KEY,
      office_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 160),
      description TEXT NOT NULL DEFAULT '',
      mom TEXT NOT NULL DEFAULT '',
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

    ALTER TABLE calendar_events
      ADD COLUMN IF NOT EXISTS live_ended_at TIMESTAMPTZ;

    ALTER TABLE calendar_events
      ADD COLUMN IF NOT EXISTS office_id TEXT NOT NULL DEFAULT 'default';

    ALTER TABLE calendar_events
      ADD COLUMN IF NOT EXISTS mom TEXT NOT NULL DEFAULT '';

    CREATE INDEX IF NOT EXISTS calendar_events_start_at_idx ON calendar_events (start_at);
    CREATE INDEX IF NOT EXISTS calendar_events_room_id_start_at_idx ON calendar_events (room_id, start_at);
    CREATE INDEX IF NOT EXISTS calendar_events_office_start_at_idx ON calendar_events (office_id, start_at);
    CREATE INDEX IF NOT EXISTS calendar_events_office_room_id_start_at_idx ON calendar_events (office_id, room_id, start_at);

    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      office_id TEXT NOT NULL DEFAULT 'default',
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

    ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

    ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS office_id TEXT NOT NULL DEFAULT 'default';

    CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at DESC);
    CREATE INDEX IF NOT EXISTS notifications_read_at_created_at_idx ON notifications (read_at, created_at DESC);
    CREATE INDEX IF NOT EXISTS notifications_office_created_at_idx ON notifications (office_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS auth_users (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 80),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      skin TEXT NOT NULL,
      email_verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS email_verification_tokens_user_id_idx
      ON email_verification_tokens (user_id);

    CREATE TABLE IF NOT EXISTS offices (
      id UUID PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 100),
      creator_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS office_members (
      office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (office_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS office_members_user_id_idx
      ON office_members (user_id);
  `).then(() => undefined);

  await globalStore.gatherDbReady;
}

export async function listChatMessages(channelId: string, afterId: number, officeId = DEFAULT_OFFICE_ID) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  if (afterId <= 0) {
    const result = await pool.query<{
      id: string;
      office_id: string;
      channel_id: string;
      from_id: string;
      from_name: string;
      body: string;
      created_at_ms: string;
    }>(
      `SELECT *
         FROM (
           SELECT id, office_id, channel_id, from_id, from_name, body,
                  (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS created_at_ms
             FROM chat_messages
            WHERE office_id = $1 AND channel_id = $2
            ORDER BY id DESC
            LIMIT 100
         ) recent
        ORDER BY id ASC`,
      [officeId, channelId],
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      officeId: row.office_id,
      channelId: row.channel_id,
      fromId: row.from_id,
      fromName: row.from_name,
      body: row.body,
      createdAt: Number(row.created_at_ms),
    })) satisfies StoredChatMessage[];
  }

  const result = await pool.query<{
    id: string;
    office_id: string;
    channel_id: string;
    from_id: string;
    from_name: string;
    body: string;
    created_at_ms: string;
  }>(
    `SELECT id, office_id, channel_id, from_id, from_name, body,
            (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS created_at_ms
       FROM chat_messages
      WHERE office_id = $1 AND channel_id = $2 AND id > $3
      ORDER BY id ASC
      LIMIT 100`,
    [officeId, channelId, afterId],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    officeId: row.office_id,
    channelId: row.channel_id,
    fromId: row.from_id,
    fromName: row.from_name,
    body: row.body,
    createdAt: Number(row.created_at_ms),
  })) satisfies StoredChatMessage[];
}

export async function pruneRealtimeState() {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  await pool.query(`
    DELETE FROM realtime_presence WHERE updated_at < now() - interval '15 seconds';
    DELETE FROM realtime_signals WHERE created_at < now() - interval '60 seconds';
  `);
  return true;
}

export async function listPresence(officeId = DEFAULT_OFFICE_ID) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  await pruneRealtimeState();
  const result = await pool.query<{
    employee_id: string;
    office_id: string;
    name: string;
    skin: string;
    x: number;
    y: number;
    status: string;
    meeting_id: string | null;
    updated_at_ms: string;
  }>(
    `SELECT employee_id, office_id, name, skin, x, y, status, meeting_id,
            (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint AS updated_at_ms
       FROM realtime_presence
      WHERE office_id = $1
      ORDER BY updated_at DESC`,
    [officeId],
  );

  return result.rows.map((row) => ({
    id: row.employee_id,
    name: row.name,
    skin: row.skin,
    position: { x: row.x, y: row.y },
    status: row.status,
    meetingId: row.meeting_id,
    updatedAt: Number(row.updated_at_ms),
  })) satisfies StoredPresence[];
}

export async function savePresence(user: StoredPresence) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  await pool.query(
    `INSERT INTO realtime_presence (employee_id, office_id, name, skin, x, y, status, meeting_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (employee_id)
     DO UPDATE SET
       office_id = EXCLUDED.office_id,
       name = EXCLUDED.name,
       skin = EXCLUDED.skin,
       x = EXCLUDED.x,
       y = EXCLUDED.y,
       status = EXCLUDED.status,
       meeting_id = EXCLUDED.meeting_id,
       updated_at = now()`,
    [user.id, (user as StoredPresence & { officeId?: string }).officeId ?? DEFAULT_OFFICE_ID, user.name, user.skin, user.position.x, user.position.y, user.status, user.meetingId],
  );
  return true;
}

export async function deletePresence(employeeId: string, officeId?: string) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  await pool.query(
    officeId ? "DELETE FROM realtime_presence WHERE employee_id = $1 AND office_id = $2" : "DELETE FROM realtime_presence WHERE employee_id = $1",
    officeId ? [employeeId, officeId] : [employeeId],
  );
  return true;
}

export async function createSignal(message: Omit<StoredSignalMessage, "id" | "createdAt"> & { officeId?: string }) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  const result = await pool.query<{ id: string }>(
    `INSERT INTO realtime_signals (office_id, from_id, to_id, meeting_id, kind, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id`,
    [message.officeId ?? DEFAULT_OFFICE_ID, message.from, message.to, message.meetingId, message.kind, JSON.stringify(message.payload ?? {})],
  );
  return Number(result.rows[0]?.id ?? 0);
}

export async function listSignals(userId: string, afterId: number, officeId = DEFAULT_OFFICE_ID) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  await pruneRealtimeState();
  const result = await pool.query<{
    id: string;
    from_id: string;
    to_id: string;
    meeting_id: string;
    kind: StoredSignalMessage["kind"];
    payload: unknown;
    created_at_ms: string;
  }>(
    `SELECT id, from_id, to_id, meeting_id, kind, payload,
            (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS created_at_ms
       FROM realtime_signals
      WHERE office_id = $1
        AND id > $2
        AND (to_id = $3 OR to_id = '*')
      ORDER BY id ASC
      LIMIT 200`,
    [officeId, afterId, userId],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    from: row.from_id,
    to: row.to_id,
    meetingId: row.meeting_id,
    kind: row.kind,
    payload: row.payload,
    createdAt: Number(row.created_at_ms),
  })) satisfies StoredSignalMessage[];
}

export async function latestSignalId(officeId = DEFAULT_OFFICE_ID) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  const result = await pool.query<{ id: string }>("SELECT COALESCE(MAX(id), 0)::bigint AS id FROM realtime_signals WHERE office_id = $1", [officeId]);
  return Number(result.rows[0]?.id ?? 0);
}

export async function latestChatId(officeId = DEFAULT_OFFICE_ID) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  const result = await pool.query<{ id: string }>("SELECT COALESCE(MAX(id), 0)::bigint AS id FROM chat_messages WHERE office_id = $1", [officeId]);
  return Number(result.rows[0]?.id ?? 0);
}

export async function createChatMessage(message: Omit<StoredChatMessage, "id" | "createdAt">) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const result = await pool.query<{
    id: string;
    office_id: string;
    channel_id: string;
    from_id: string;
    from_name: string;
    body: string;
    created_at_ms: string;
  }>(
    `INSERT INTO chat_messages (office_id, channel_id, from_id, from_name, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, office_id, channel_id, from_id, from_name, body,
               (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS created_at_ms`,
    [message.officeId, message.channelId, message.fromId, message.fromName, message.body],
  );

  const row = result.rows[0];
  return {
    id: Number(row.id),
    officeId: row.office_id,
    channelId: row.channel_id,
    fromId: row.from_id,
    fromName: row.from_name,
    body: row.body,
    createdAt: Number(row.created_at_ms),
  } satisfies StoredChatMessage;
}

export async function saveEmployeePosition(employeeId: string, position: { x: number; y: number }, officeId = DEFAULT_OFFICE_ID) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  await pool.query(
    `INSERT INTO employee_positions (employee_id, office_id, x, y)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (employee_id)
     DO UPDATE SET office_id = EXCLUDED.office_id, x = EXCLUDED.x, y = EXCLUDED.y, updated_at = now()`,
    [employeeId, officeId, position.x, position.y],
  );
  return true;
}

export async function getEmployeePosition(employeeId: string, officeId = DEFAULT_OFFICE_ID) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  const result = await pool.query<{ x: number; y: number }>(
    "SELECT x, y FROM employee_positions WHERE employee_id = $1 AND office_id = $2",
    [employeeId, officeId],
  );
  const row = result.rows[0];
  return row ? { x: row.x, y: row.y } : null;
}

function mapCalendarRow(row: {
  id: string;
  office_id?: string;
  title: string;
  description: string;
  mom?: string;
  room_id: string;
  room_name: string;
  start_at: Date;
  end_at: Date;
  creator_id: string;
  creator_name: string;
  live_started_at: Date | null;
  live_ended_at: Date | null;
  created_at: Date;
}) {
  return {
    id: Number(row.id),
    officeId: row.office_id ?? DEFAULT_OFFICE_ID,
    title: row.title,
    description: row.description,
    mom: row.mom ?? "",
    roomId: row.room_id,
    roomName: row.room_name,
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    liveStartedAt: row.live_started_at ? row.live_started_at.toISOString() : null,
    liveEndedAt: row.live_ended_at ? row.live_ended_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  } satisfies StoredCalendarEvent;
}

export async function listCalendarEvents(rangeStart: string, rangeEnd: string, roomId?: string | null, officeId = DEFAULT_OFFICE_ID) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const params = roomId ? [officeId, rangeStart, rangeEnd, roomId] : [officeId, rangeStart, rangeEnd];
  const result = await pool.query<{
    id: string;
    office_id: string;
    title: string;
    description: string;
    mom: string;
    room_id: string;
    room_name: string;
    start_at: Date;
    end_at: Date;
    creator_id: string;
    creator_name: string;
    live_started_at: Date | null;
    live_ended_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, office_id, title, description, mom, room_id, room_name, start_at, end_at, creator_id, creator_name, live_started_at, live_ended_at, created_at
       FROM calendar_events
      WHERE office_id = $1
        AND start_at < $3::timestamptz
        AND end_at > $2::timestamptz
        ${roomId ? "AND room_id = $4" : ""}
      ORDER BY start_at ASC`,
    params,
  );

  return result.rows.map(mapCalendarRow);
}

export async function createCalendarEvent(event: Omit<StoredCalendarEvent, "id" | "createdAt" | "liveStartedAt" | "liveEndedAt" | "mom">) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const result = await pool.query<{
    id: string;
    office_id: string;
    title: string;
    description: string;
    mom: string;
    room_id: string;
    room_name: string;
    start_at: Date;
    end_at: Date;
    creator_id: string;
    creator_name: string;
    live_started_at: Date | null;
    live_ended_at: Date | null;
    created_at: Date;
  }>(
    `INSERT INTO calendar_events (office_id, title, description, room_id, room_name, start_at, end_at, creator_id, creator_name)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9)
     RETURNING id, office_id, title, description, mom, room_id, room_name, start_at, end_at, creator_id, creator_name, live_started_at, live_ended_at, created_at`,
    [event.officeId, event.title, event.description, event.roomId, event.roomName, event.startAt, event.endAt, event.creatorId, event.creatorName],
  );

  return mapCalendarRow(result.rows[0]);
}

export async function startCalendarEvent(eventId: number, creatorId: string, officeId = DEFAULT_OFFICE_ID) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const result = await pool.query<{
    id: string;
    office_id: string;
    title: string;
    description: string;
    mom: string;
    room_id: string;
    room_name: string;
    start_at: Date;
    end_at: Date;
    creator_id: string;
    creator_name: string;
    live_started_at: Date | null;
    live_ended_at: Date | null;
    created_at: Date;
  }>(
    `UPDATE calendar_events
        SET live_started_at = COALESCE(live_started_at, now()),
            live_ended_at = NULL
      WHERE id = $1 AND creator_id = $2
        AND office_id = $3
        AND live_ended_at IS NULL
      RETURNING id, office_id, title, description, mom, room_id, room_name, start_at, end_at, creator_id, creator_name, live_started_at, live_ended_at, created_at`,
    [eventId, creatorId, officeId],
  );

  return result.rows[0] ? mapCalendarRow(result.rows[0]) : null;
}

export async function endCalendarEvent(eventId: number, creatorId: string, officeId = DEFAULT_OFFICE_ID, mom = "") {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const result = await pool.query<{
    id: string;
    office_id: string;
    title: string;
    description: string;
    mom: string;
    room_id: string;
    room_name: string;
    start_at: Date;
    end_at: Date;
    creator_id: string;
    creator_name: string;
    live_started_at: Date | null;
    live_ended_at: Date | null;
    created_at: Date;
  }>(
    `UPDATE calendar_events
        SET live_ended_at = COALESCE(live_ended_at, now()),
            mom = CASE WHEN char_length($4) > 0 THEN $4 ELSE mom END
      WHERE id = $1
        AND creator_id = $2
        AND office_id = $3
        AND live_started_at IS NOT NULL
      RETURNING id, office_id, title, description, mom, room_id, room_name, start_at, end_at, creator_id, creator_name, live_started_at, live_ended_at, created_at`,
    [eventId, creatorId, officeId, mom.slice(0, 4000)],
  );

  return result.rows[0] ? mapCalendarRow(result.rows[0]) : null;
}

function mapNotificationRow(row: {
  id: string;
  office_id?: string;
  event_id: string;
  type: StoredNotification["type"];
  title: string;
  body: string;
  room_name: string;
  event_start_at: Date;
  created_at: Date;
  read_at: Date | null;
}) {
  return {
    id: Number(row.id),
    officeId: row.office_id ?? DEFAULT_OFFICE_ID,
    eventId: Number(row.event_id),
    type: row.type,
    title: row.title,
    body: row.body,
    roomName: row.room_name,
    eventStartAt: row.event_start_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    readAt: row.read_at?.toISOString() ?? null,
  } satisfies StoredNotification;
}

export async function createEventNotification(event: StoredCalendarEvent, type: StoredNotification["type"]) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const label = {
    created: "Meeting created",
    day_before: "Meeting in 24 hours",
    hour_before: "Meeting starts in 1 hour",
    started: "Meeting started",
  }[type];

  const body = {
    created: `${event.creatorName} created ${event.title} in ${event.roomName}.`,
    day_before: `${event.title} starts within 24 hours in ${event.roomName}.`,
    hour_before: `${event.title} starts in about 1 hour in ${event.roomName}.`,
    started: `${event.title} has started in ${event.roomName}.`,
  }[type];

  const result = await pool.query<{
    id: string;
    event_id: string;
    office_id: string;
    type: StoredNotification["type"];
    title: string;
    body: string;
    room_name: string;
    event_start_at: Date;
    created_at: Date;
    read_at: Date | null;
  }>(
    `INSERT INTO notifications (office_id, event_id, type, title, body, room_name, event_start_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
     ON CONFLICT (event_id, type) DO NOTHING
     RETURNING id, office_id, event_id, type, title, body, room_name, event_start_at, created_at, read_at`,
    [event.officeId, event.id, type, label, body, event.roomName, event.startAt],
  );

  return result.rows[0] ? mapNotificationRow(result.rows[0]) : null;
}

export async function generateDueNotifications(officeId = DEFAULT_OFFICE_ID) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const result = await pool.query<{
    id: string;
    office_id: string;
    title: string;
    description: string;
    room_id: string;
    room_name: string;
    start_at: Date;
    end_at: Date;
    creator_id: string;
    creator_name: string;
    live_started_at: Date | null;
    live_ended_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, office_id, title, description, mom, room_id, room_name, start_at, end_at, creator_id, creator_name, live_started_at, live_ended_at, created_at
       FROM calendar_events
      WHERE office_id = $1
        AND start_at > now()
        AND start_at <= now() + interval '1 day'`,
    [officeId],
  );

  const created: StoredNotification[] = [];
  for (const row of result.rows) {
    const event = mapCalendarRow(row);
    const startsAt = new Date(event.startAt).getTime();
    const now = Date.now();
    if (startsAt - now <= 24 * 60 * 60 * 1000) {
      const notification = await createEventNotification(event, "day_before");
      if (notification) created.push(notification);
    }
    if (startsAt - now <= 60 * 60 * 1000) {
      const notification = await createEventNotification(event, "hour_before");
      if (notification) created.push(notification);
    }
  }

  return created;
}

export async function listNotifications(officeId = DEFAULT_OFFICE_ID) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  await generateDueNotifications(officeId);

  const result = await pool.query<{
    id: string;
    office_id: string;
    event_id: string;
    type: StoredNotification["type"];
    title: string;
    body: string;
    room_name: string;
    event_start_at: Date;
    created_at: Date;
    read_at: Date | null;
  }>(
    `SELECT id, office_id, event_id, type, title, body, room_name, event_start_at, created_at, read_at
       FROM notifications
      WHERE office_id = $1
      ORDER BY read_at ASC NULLS FIRST, created_at DESC
      LIMIT 100`,
    [officeId],
  );

  return result.rows.map(mapNotificationRow);
}

export async function markNotificationRead(notificationId: number) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const result = await pool.query<{
    id: string;
    office_id: string;
    event_id: string;
    type: StoredNotification["type"];
    title: string;
    body: string;
    room_name: string;
    event_start_at: Date;
    created_at: Date;
    read_at: Date | null;
  }>(
    `UPDATE notifications
        SET read_at = COALESCE(read_at, now())
      WHERE id = $1
      RETURNING id, office_id, event_id, type, title, body, room_name, event_start_at, created_at, read_at`,
    [notificationId],
  );

  return result.rows[0] ? mapNotificationRow(result.rows[0]) : null;
}

function mapOfficeRow(row: {
  id: string;
  code: string;
  name: string;
  creator_id: string;
  role: StoredOffice["role"];
  created_at: Date;
}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    creatorId: row.creator_id,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  } satisfies StoredOffice;
}

function createOfficeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function listUserOffices(userId: string) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const result = await pool.query<{
    id: string;
    code: string;
    name: string;
    creator_id: string;
    role: StoredOffice["role"];
    created_at: Date;
  }>(
    `SELECT offices.id, offices.code, offices.name, offices.creator_id, office_members.role, offices.created_at
       FROM office_members
       JOIN offices ON offices.id = office_members.office_id
      WHERE office_members.user_id = $1
      ORDER BY office_members.joined_at DESC`,
    [userId],
  );

  return result.rows.map(mapOfficeRow);
}

export async function createOfficeForUser(user: Pick<AuthUser, "id">, name: string) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = randomUUID();
    const code = createOfficeCode();
    try {
      const result = await pool.query<{
        id: string;
        code: string;
        name: string;
        creator_id: string;
        role: StoredOffice["role"];
        created_at: Date;
      }>(
        `WITH created_office AS (
           INSERT INTO offices (id, code, name, creator_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, code, name, creator_id, created_at
         ),
         created_member AS (
           INSERT INTO office_members (office_id, user_id, role)
           SELECT id, $4, 'owner' FROM created_office
           RETURNING role
         )
         SELECT created_office.id, created_office.code, created_office.name, created_office.creator_id, created_member.role, created_office.created_at
           FROM created_office, created_member`,
        [id, code, name.slice(0, 100), user.id],
      );
      return result.rows[0] ? mapOfficeRow(result.rows[0]) : null;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }

  return null;
}

export async function joinOfficeForUser(user: Pick<AuthUser, "id">, code: string) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const result = await pool.query<{
    id: string;
    code: string;
    name: string;
    creator_id: string;
    role: StoredOffice["role"];
    created_at: Date;
  }>(
    `WITH target_office AS (
       SELECT id, code, name, creator_id, created_at
         FROM offices
        WHERE code = $1
     ),
     joined_member AS (
       INSERT INTO office_members (office_id, user_id, role)
       SELECT id, $2, CASE WHEN creator_id = $2 THEN 'owner' ELSE 'member' END
         FROM target_office
       ON CONFLICT (office_id, user_id) DO UPDATE SET role = office_members.role
       RETURNING office_id, role
     )
     SELECT target_office.id, target_office.code, target_office.name, target_office.creator_id, joined_member.role, target_office.created_at
       FROM target_office
       JOIN joined_member ON joined_member.office_id = target_office.id`,
    [code.trim().toUpperCase(), user.id],
  );

  return result.rows[0] ? mapOfficeRow(result.rows[0]) : null;
}

export async function isOfficeMember(userId: string, officeId: string) {
  const pool = getPool();
  if (!pool) return false;
  await ensureDatabase();
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM office_members WHERE user_id = $1 AND office_id = $2
     ) AS exists`,
    [userId, officeId],
  );
  return Boolean(result.rows[0]?.exists);
}

function mapAuthUser(row: {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  skin: string;
  email_verified_at: Date | null;
}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    skin: row.skin,
    emailVerified: Boolean(row.email_verified_at),
    passwordHash: row.password_hash,
  } satisfies StoredAuthUser;
}

export async function findAuthUserByEmail(email: string) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  const result = await pool.query<{
    id: string;
    name: string;
    email: string;
    password_hash: string;
    skin: string;
    email_verified_at: Date | null;
  }>(
    `SELECT id, name, email, password_hash, skin, email_verified_at
       FROM auth_users
      WHERE email = $1`,
    [email.toLowerCase()],
  );
  return result.rows[0] ? mapAuthUser(result.rows[0]) : null;
}

export async function findAuthUserById(id: string) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  const result = await pool.query<{
    id: string;
    name: string;
    email: string;
    password_hash: string;
    skin: string;
    email_verified_at: Date | null;
  }>(
    `SELECT id, name, email, password_hash, skin, email_verified_at
       FROM auth_users
      WHERE id = $1`,
    [id],
  );
  return result.rows[0] ? mapAuthUser(result.rows[0]) : null;
}

export async function upsertUnverifiedAuthUser(user: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  skin: string;
}) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  const result = await pool.query<{
    id: string;
    name: string;
    email: string;
    password_hash: string;
    skin: string;
    email_verified_at: Date | null;
  }>(
    `INSERT INTO auth_users (id, name, email, password_hash, skin)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email)
     DO UPDATE SET
       name = CASE WHEN auth_users.email_verified_at IS NULL THEN EXCLUDED.name ELSE auth_users.name END,
       password_hash = CASE WHEN auth_users.email_verified_at IS NULL THEN EXCLUDED.password_hash ELSE auth_users.password_hash END,
       skin = CASE WHEN auth_users.email_verified_at IS NULL THEN EXCLUDED.skin ELSE auth_users.skin END,
       updated_at = now()
     RETURNING id, name, email, password_hash, skin, email_verified_at`,
    [user.id, user.name, user.email.toLowerCase(), user.passwordHash, user.skin],
  );
  return result.rows[0] ? mapAuthUser(result.rows[0]) : null;
}

export async function createEmailVerificationToken(userId: string, tokenHash: string) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  await pool.query(
    `DELETE FROM email_verification_tokens
      WHERE user_id = $1 OR expires_at < now() OR used_at IS NOT NULL`,
    [userId],
  );
  await pool.query(
    `INSERT INTO email_verification_tokens (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + interval '30 minutes')`,
    [tokenHash, userId],
  );
  return true;
}

export async function verifyEmailToken(tokenHash: string) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tokenResult = await client.query<{ user_id: string }>(
      `UPDATE email_verification_tokens
          SET used_at = now()
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > now()
        RETURNING user_id`,
      [tokenHash],
    );
    const userId = tokenResult.rows[0]?.user_id;
    if (!userId) {
      await client.query("ROLLBACK");
      return null;
    }
    const userResult = await client.query<{
      id: string;
      name: string;
      email: string;
      password_hash: string;
      skin: string;
      email_verified_at: Date | null;
    }>(
      `UPDATE auth_users
          SET email_verified_at = COALESCE(email_verified_at, now()),
              updated_at = now()
        WHERE id = $1
        RETURNING id, name, email, password_hash, skin, email_verified_at`,
      [userId],
    );
    await client.query("COMMIT");
    return userResult.rows[0] ? mapAuthUser(userResult.rows[0]) : null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
