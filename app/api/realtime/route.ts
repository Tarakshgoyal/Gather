export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  createChatMessage,
  createSignal,
  deletePresence,
  getEmployeePosition,
  latestChatId,
  latestSignalId,
  listPresence,
  listSignals,
  listChatMessages,
  saveEmployeePosition,
  savePresence,
} from "@/app/lib/db";
import { getRequestJwtUser } from "@/app/lib/request-auth";

type Point = {
  x: number;
  y: number;
};

type Presence = {
  id: string;
  name: string;
  skin: string;
  position: Point;
  status: string;
  meetingId: string | null;
  updatedAt: number;
};

type SignalMessage = {
  id: number;
  from: string;
  to: string;
  meetingId: string;
  kind: "offer" | "answer" | "ice" | "leave";
  payload: unknown;
  createdAt: number;
};

type ChatMessage = {
  id: number;
  channelId: string;
  fromId: string;
  fromName: string;
  body: string;
  createdAt: number;
};

const globalStore = globalThis as typeof globalThis & {
  gatherPresence?: Map<string, Presence>;
  gatherSignals?: SignalMessage[];
  gatherSignalSeq?: number;
  gatherChatMessages?: ChatMessage[];
  gatherChatSeq?: number;
  gatherDbPresenceCache?: { users: Presence[]; fetchedAt: number };
  gatherDbPresencePromise?: Promise<Presence[] | null>;
  gatherDbSignalCache?: Map<string, { signals: SignalMessage[]; latestId: number; fetchedAt: number }>;
  gatherDbSignalPromises?: Map<string, Promise<{ signals: SignalMessage[]; latestId: number }>>;
  gatherPresencePersistedAt?: Map<string, number>;
};

const presence = globalStore.gatherPresence ?? new Map<string, Presence>();
const signals = globalStore.gatherSignals ?? [];
const chatMessages = globalStore.gatherChatMessages ?? [];
globalStore.gatherPresence = presence;
globalStore.gatherSignals = signals;
globalStore.gatherSignalSeq = globalStore.gatherSignalSeq ?? 0;
globalStore.gatherChatMessages = chatMessages;
globalStore.gatherChatSeq = globalStore.gatherChatSeq ?? 0;
globalStore.gatherDbPresenceCache = globalStore.gatherDbPresenceCache ?? { users: [], fetchedAt: 0 };
globalStore.gatherDbSignalCache = globalStore.gatherDbSignalCache ?? new Map<string, { signals: SignalMessage[]; latestId: number; fetchedAt: number }>();
globalStore.gatherDbSignalPromises = globalStore.gatherDbSignalPromises ?? new Map<string, Promise<{ signals: SignalMessage[]; latestId: number }>>();
globalStore.gatherPresencePersistedAt = globalStore.gatherPresencePersistedAt ?? new Map<string, number>();

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

function prune() {
  const now = Date.now();
  for (const [id, user] of presence) {
    if (now - user.updatedAt > 15_000) {
      presence.delete(id);
    }
  }

  const cutoff = now - 60_000;
  while (signals.length && signals[0].createdAt < cutoff) {
    signals.shift();
  }
}

async function getSharedPresence() {
  const now = Date.now();
  const cached = globalStore.gatherDbPresenceCache ?? { users: [], fetchedAt: 0 };
  if (now - cached.fetchedAt > 900) {
    globalStore.gatherDbPresencePromise = globalStore.gatherDbPresencePromise ?? listPresence().finally(() => {
      globalStore.gatherDbPresencePromise = undefined;
    });
    const persistedUsers = await globalStore.gatherDbPresencePromise.catch(() => null);
    if (persistedUsers) {
      globalStore.gatherDbPresenceCache = { users: persistedUsers, fetchedAt: now };
    }
  }

  const merged = new Map<string, Presence>();
  for (const user of globalStore.gatherDbPresenceCache?.users ?? []) {
    if (now - user.updatedAt <= 15_000) merged.set(user.id, user);
  }
  for (const user of presence.values()) {
    if (now - user.updatedAt <= 15_000) {
      const existing = merged.get(user.id);
      if (!existing || user.updatedAt >= existing.updatedAt) merged.set(user.id, user);
    }
  }

  return Array.from(merged.values());
}

async function getSharedSignals(userId: string, after: number) {
  const now = Date.now();
  const cacheKey = `${userId}:${after}`;
  const cached = globalStore.gatherDbSignalCache?.get(cacheKey);
  if (cached && now - cached.fetchedAt <= 900) return cached;

  let promise = globalStore.gatherDbSignalPromises?.get(cacheKey);
  if (!promise) {
    promise = Promise.all([
      listSignals(userId, after).catch(() => null),
      latestSignalId().catch(() => null),
    ]).then(([persistedSignals, persistedLatestSignalId]) => ({
      signals: persistedSignals ?? [],
      latestId: persistedLatestSignalId ?? 0,
    })).finally(() => {
      globalStore.gatherDbSignalPromises?.delete(cacheKey);
    });
    globalStore.gatherDbSignalPromises?.set(cacheKey, promise);
  }

  const result = await promise.catch(() => ({ signals: [], latestId: 0 }));
  const nextCache = { ...result, fetchedAt: Date.now() };
  globalStore.gatherDbSignalCache?.set(cacheKey, nextCache);
  if ((globalStore.gatherDbSignalCache?.size ?? 0) > 50) {
    for (const [key, value] of globalStore.gatherDbSignalCache ?? []) {
      if (Date.now() - value.fetchedAt > 10_000) globalStore.gatherDbSignalCache?.delete(key);
    }
  }
  return nextCache;
}

export async function GET(request: Request) {
  const authUser = getRequestJwtUser(request);
  if (!authUser) return Response.json({ error: "Authentication required" }, { status: 401, headers: noStoreHeaders });
  prune();
  const url = new URL(request.url);
  const userId = authUser.id;
  const after = Number(url.searchParams.get("after") ?? "0");
  const channelId = url.searchParams.get("channelId");
  const afterChat = Number(url.searchParams.get("afterChat") ?? "0");
  const positionFor = url.searchParams.get("positionFor");
  const [sharedPresence, sharedSignals] = await Promise.all([
    getSharedPresence(),
    getSharedSignals(userId, after),
  ]);
  const persistedChatMessages = channelId ? await listChatMessages(channelId, afterChat).catch(() => null) : null;
  const persistedLatestChatId = channelId ? await latestChatId().catch(() => null) : null;
  const savedPosition = positionFor === authUser.id ? await getEmployeePosition(authUser.id).catch(() => null) : null;
  const localSignals = signals.filter((message) => message.id > after && (message.to === userId || message.to === "*"));
  const mergedSignals = new Map<number, SignalMessage>();
  for (const message of sharedSignals.signals) mergedSignals.set(message.id, message);
  for (const message of localSignals) mergedSignals.set(message.id, message);
  const currentLatestSignalId = Math.max(globalStore.gatherSignalSeq ?? 0, sharedSignals.latestId);

  return Response.json({
    users: sharedPresence,
    signals: Array.from(mergedSignals.values()).sort((a, b) => a.id - b.id),
    latestSignalId: currentLatestSignalId,
    chatMessages: persistedChatMessages ?? (channelId ? chatMessages.filter((message) => message.channelId === channelId && message.id > afterChat) : []),
    latestChatId: persistedLatestChatId ?? globalStore.gatherChatSeq ?? 0,
    savedPosition,
  }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const authUser = getRequestJwtUser(request);
  if (!authUser) return Response.json({ error: "Authentication required" }, { status: 401, headers: noStoreHeaders });
  const body = await request.json();
  prune();

  if (body.type === "presence") {
    const user = {
      id: authUser.id,
      name: authUser.name,
      skin: authUser.skin,
      position: body.user.position,
      status: String(body.user.status),
      meetingId: body.user.meetingId ? String(body.user.meetingId) : null,
      updatedAt: Date.now(),
    };
    presence.set(user.id, user);
    const lastPersistedAt = globalStore.gatherPresencePersistedAt?.get(user.id) ?? 0;
    if (Date.now() - lastPersistedAt > 700) {
      globalStore.gatherPresencePersistedAt?.set(user.id, Date.now());
      await savePresence(user).catch(() => null);
    }
    void saveEmployeePosition(authUser.id, body.user.position).catch(() => null);

    return Response.json({ ok: true }, { headers: noStoreHeaders });
  }

  if (body.type === "signal") {
    const persistedId = await createSignal({
      from: authUser.id,
      to: String(body.message.to),
      meetingId: String(body.message.meetingId),
      kind: body.message.kind,
      payload: body.message.payload,
    }).catch(() => null);
    globalStore.gatherSignalSeq = Math.max(globalStore.gatherSignalSeq ?? 0, persistedId ?? 0) + (persistedId ? 0 : 1);
    const signalId = persistedId ?? globalStore.gatherSignalSeq;
    signals.push({
      id: signalId,
      from: authUser.id,
      to: String(body.message.to),
      meetingId: String(body.message.meetingId),
      kind: body.message.kind,
      payload: body.message.payload,
      createdAt: Date.now(),
    });

    return Response.json({ ok: true, id: signalId }, { headers: noStoreHeaders });
  }

  if (body.type === "chat") {
    const text = String(body.message.body ?? "").trim();
    if (!text) {
      return Response.json({ error: "Message cannot be empty" }, { status: 400, headers: noStoreHeaders });
    }

    const persistedMessage = await createChatMessage({
      channelId: String(body.message.channelId),
      fromId: authUser.id,
      fromName: authUser.name,
      body: text.slice(0, 2000),
    }).catch(() => null);
    if (persistedMessage) {
      return Response.json({ ok: true, message: persistedMessage }, { headers: noStoreHeaders });
    }

    globalStore.gatherChatSeq = (globalStore.gatherChatSeq ?? 0) + 1;
    const message = {
      id: globalStore.gatherChatSeq,
      channelId: String(body.message.channelId),
      fromId: authUser.id,
      fromName: authUser.name,
      body: text.slice(0, 2000),
      createdAt: Date.now(),
    };
    chatMessages.push(message);

    return Response.json({ ok: true, message }, { headers: noStoreHeaders });
  }

  if (body.type === "leave") {
    const userId = authUser.id;
    presence.delete(userId);
    void deletePresence(userId).catch(() => null);

    const persistedId = await createSignal({
      from: userId,
      to: "*",
      meetingId: "*",
      kind: "leave",
      payload: {},
    }).catch(() => null);
    globalStore.gatherSignalSeq = Math.max(globalStore.gatherSignalSeq ?? 0, persistedId ?? 0) + (persistedId ? 0 : 1);
    const signalId = persistedId ?? globalStore.gatherSignalSeq;
    signals.push({
      id: signalId,
      from: userId,
      to: "*",
      meetingId: "*",
      kind: "leave",
      payload: {},
      createdAt: Date.now(),
    });

    return Response.json({ ok: true }, { headers: noStoreHeaders });
  }

  return Response.json({ error: "Unknown realtime message" }, { status: 400, headers: noStoreHeaders });
}
