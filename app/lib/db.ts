import { Pool } from "pg";

const globalStore = globalThis as typeof globalThis & {
  gatherPgPool?: Pool;
  gatherDbReady?: Promise<void>;
};

export type StoredChatMessage = {
  id: number;
  channelId: string;
  fromId: string;
  fromName: string;
  body: string;
  createdAt: number;
};

export type StoredCalendarEvent = {
  id: number;
  title: string;
  description: string;
  roomId: string;
  roomName: string;
  startAt: string;
  endAt: string;
  creatorId: string;
  creatorName: string;
  liveStartedAt: string | null;
  createdAt: string;
};

export type StoredNotification = {
  id: number;
  eventId: number;
  type: "created" | "day_before" | "hour_before" | "started";
  title: string;
  body: string;
  roomName: string;
  eventStartAt: string;
  createdAt: string;
  readAt: string | null;
};

export function getPool() {
  if (!process.env.DATABASE_URL) return null;
  globalStore.gatherPgPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
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
      channel_id TEXT NOT NULL,
      from_id TEXT NOT NULL,
      from_name TEXT NOT NULL,
      body TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 2000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS chat_messages_channel_id_id_idx
      ON chat_messages (channel_id, id);

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

    ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at DESC);
    CREATE INDEX IF NOT EXISTS notifications_read_at_created_at_idx ON notifications (read_at, created_at DESC);
  `).then(() => undefined);

  await globalStore.gatherDbReady;
}

export async function listChatMessages(channelId: string, afterId: number) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  if (afterId <= 0) {
    const result = await pool.query<{
      id: string;
      channel_id: string;
      from_id: string;
      from_name: string;
      body: string;
      created_at_ms: string;
    }>(
      `SELECT *
         FROM (
           SELECT id, channel_id, from_id, from_name, body,
                  (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS created_at_ms
             FROM chat_messages
            WHERE channel_id = $1
            ORDER BY id DESC
            LIMIT 100
         ) recent
        ORDER BY id ASC`,
      [channelId],
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      channelId: row.channel_id,
      fromId: row.from_id,
      fromName: row.from_name,
      body: row.body,
      createdAt: Number(row.created_at_ms),
    })) satisfies StoredChatMessage[];
  }

  const result = await pool.query<{
    id: string;
    channel_id: string;
    from_id: string;
    from_name: string;
    body: string;
    created_at_ms: string;
  }>(
    `SELECT id, channel_id, from_id, from_name, body,
            (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS created_at_ms
       FROM chat_messages
      WHERE channel_id = $1 AND id > $2
      ORDER BY id ASC
      LIMIT 100`,
    [channelId, afterId],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    channelId: row.channel_id,
    fromId: row.from_id,
    fromName: row.from_name,
    body: row.body,
    createdAt: Number(row.created_at_ms),
  })) satisfies StoredChatMessage[];
}

export async function latestChatId() {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  const result = await pool.query<{ id: string }>("SELECT COALESCE(MAX(id), 0)::bigint AS id FROM chat_messages");
  return Number(result.rows[0]?.id ?? 0);
}

export async function createChatMessage(message: Omit<StoredChatMessage, "id" | "createdAt">) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const result = await pool.query<{
    id: string;
    channel_id: string;
    from_id: string;
    from_name: string;
    body: string;
    created_at_ms: string;
  }>(
    `INSERT INTO chat_messages (channel_id, from_id, from_name, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, channel_id, from_id, from_name, body,
               (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS created_at_ms`,
    [message.channelId, message.fromId, message.fromName, message.body],
  );

  const row = result.rows[0];
  return {
    id: Number(row.id),
    channelId: row.channel_id,
    fromId: row.from_id,
    fromName: row.from_name,
    body: row.body,
    createdAt: Number(row.created_at_ms),
  } satisfies StoredChatMessage;
}

export async function saveEmployeePosition(employeeId: string, position: { x: number; y: number }) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  await pool.query(
    `INSERT INTO employee_positions (employee_id, x, y)
     VALUES ($1, $2, $3)
     ON CONFLICT (employee_id)
     DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y, updated_at = now()`,
    [employeeId, position.x, position.y],
  );
  return true;
}

export async function getEmployeePosition(employeeId: string) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  const result = await pool.query<{ x: number; y: number }>(
    "SELECT x, y FROM employee_positions WHERE employee_id = $1",
    [employeeId],
  );
  const row = result.rows[0];
  return row ? { x: row.x, y: row.y } : null;
}

function mapCalendarRow(row: {
  id: string;
  title: string;
  description: string;
  room_id: string;
  room_name: string;
  start_at: Date;
  end_at: Date;
  creator_id: string;
  creator_name: string;
  live_started_at: Date | null;
  created_at: Date;
}) {
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description,
    roomId: row.room_id,
    roomName: row.room_name,
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    liveStartedAt: row.live_started_at ? row.live_started_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  } satisfies StoredCalendarEvent;
}

export async function listCalendarEvents(rangeStart: string, rangeEnd: string, roomId?: string | null) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const params = roomId ? [rangeStart, rangeEnd, roomId] : [rangeStart, rangeEnd];
  const result = await pool.query<{
    id: string;
    title: string;
    description: string;
    room_id: string;
    room_name: string;
    start_at: Date;
    end_at: Date;
    creator_id: string;
    creator_name: string;
    live_started_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, title, description, room_id, room_name, start_at, end_at, creator_id, creator_name, live_started_at, created_at
       FROM calendar_events
      WHERE start_at < $2::timestamptz
        AND end_at > $1::timestamptz
        ${roomId ? "AND room_id = $3" : ""}
      ORDER BY start_at ASC`,
    params,
  );

  return result.rows.map(mapCalendarRow);
}

export async function createCalendarEvent(event: Omit<StoredCalendarEvent, "id" | "createdAt" | "liveStartedAt">) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const result = await pool.query<{
    id: string;
    title: string;
    description: string;
    room_id: string;
    room_name: string;
    start_at: Date;
    end_at: Date;
    creator_id: string;
    creator_name: string;
    live_started_at: Date | null;
    created_at: Date;
  }>(
    `INSERT INTO calendar_events (title, description, room_id, room_name, start_at, end_at, creator_id, creator_name)
     VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8)
     RETURNING id, title, description, room_id, room_name, start_at, end_at, creator_id, creator_name, live_started_at, created_at`,
    [event.title, event.description, event.roomId, event.roomName, event.startAt, event.endAt, event.creatorId, event.creatorName],
  );

  return mapCalendarRow(result.rows[0]);
}

export async function startCalendarEvent(eventId: number, creatorId: string) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const result = await pool.query<{
    id: string;
    title: string;
    description: string;
    room_id: string;
    room_name: string;
    start_at: Date;
    end_at: Date;
    creator_id: string;
    creator_name: string;
    live_started_at: Date | null;
    created_at: Date;
  }>(
    `UPDATE calendar_events
        SET live_started_at = COALESCE(live_started_at, now())
      WHERE id = $1 AND creator_id = $2
      RETURNING id, title, description, room_id, room_name, start_at, end_at, creator_id, creator_name, live_started_at, created_at`,
    [eventId, creatorId],
  );

  return result.rows[0] ? mapCalendarRow(result.rows[0]) : null;
}

function mapNotificationRow(row: {
  id: string;
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
    type: StoredNotification["type"];
    title: string;
    body: string;
    room_name: string;
    event_start_at: Date;
    created_at: Date;
    read_at: Date | null;
  }>(
    `INSERT INTO notifications (event_id, type, title, body, room_name, event_start_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
     ON CONFLICT (event_id, type) DO NOTHING
     RETURNING id, event_id, type, title, body, room_name, event_start_at, created_at, read_at`,
    [event.id, type, label, body, event.roomName, event.startAt],
  );

  return result.rows[0] ? mapNotificationRow(result.rows[0]) : null;
}

export async function generateDueNotifications() {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const result = await pool.query<{
    id: string;
    title: string;
    description: string;
    room_id: string;
    room_name: string;
    start_at: Date;
    end_at: Date;
    creator_id: string;
    creator_name: string;
    live_started_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, title, description, room_id, room_name, start_at, end_at, creator_id, creator_name, live_started_at, created_at
       FROM calendar_events
      WHERE start_at > now()
        AND start_at <= now() + interval '1 day'`,
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

export async function listNotifications() {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();
  await generateDueNotifications();

  const result = await pool.query<{
    id: string;
    event_id: string;
    type: StoredNotification["type"];
    title: string;
    body: string;
    room_name: string;
    event_start_at: Date;
    created_at: Date;
    read_at: Date | null;
  }>(
    `SELECT id, event_id, type, title, body, room_name, event_start_at, created_at, read_at
       FROM notifications
      ORDER BY read_at ASC NULLS FIRST, created_at DESC
      LIMIT 100`,
  );

  return result.rows.map(mapNotificationRow);
}

export async function markNotificationRead(notificationId: number) {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatabase();

  const result = await pool.query<{
    id: string;
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
      RETURNING id, event_id, type, title, body, room_name, event_start_at, created_at, read_at`,
    [notificationId],
  );

  return result.rows[0] ? mapNotificationRow(result.rows[0]) : null;
}
