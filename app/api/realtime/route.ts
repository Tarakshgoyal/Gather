export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  createChatMessage,
  createSignal,
  deletePresence,
  getEmployeePosition,
  latestChatId,
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
};

const presence = globalStore.gatherPresence ?? new Map<string, Presence>();
const signals = globalStore.gatherSignals ?? [];
const chatMessages = globalStore.gatherChatMessages ?? [];
globalStore.gatherPresence = presence;
globalStore.gatherSignals = signals;
globalStore.gatherSignalSeq = globalStore.gatherSignalSeq ?? 0;
globalStore.gatherChatMessages = chatMessages;
globalStore.gatherChatSeq = globalStore.gatherChatSeq ?? 0;

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

export async function GET(request: Request) {
  const authUser = getRequestJwtUser(request);
  if (!authUser) return Response.json({ error: "Authentication required" }, { status: 401 });
  prune();
  const url = new URL(request.url);
  const userId = authUser.id;
  const after = Number(url.searchParams.get("after") ?? "0");
  const channelId = url.searchParams.get("channelId");
  const afterChat = Number(url.searchParams.get("afterChat") ?? "0");
  const positionFor = url.searchParams.get("positionFor");
  const persistedChatMessages = channelId ? await listChatMessages(channelId, afterChat).catch(() => null) : null;
  const persistedLatestChatId = channelId ? await latestChatId().catch(() => null) : null;
  const savedPosition = positionFor === authUser.id ? await getEmployeePosition(authUser.id).catch(() => null) : null;

  return Response.json({
    users: Array.from(presence.values()),
    signals: signals.filter((message) => message.id > after && (message.to === userId || message.to === "*")),
    latestSignalId: globalStore.gatherSignalSeq ?? 0,
    chatMessages: persistedChatMessages ?? (channelId ? chatMessages.filter((message) => message.channelId === channelId && message.id > afterChat) : []),
    latestChatId: persistedLatestChatId ?? globalStore.gatherChatSeq ?? 0,
    savedPosition,
  });
}

export async function POST(request: Request) {
  const authUser = getRequestJwtUser(request);
  if (!authUser) return Response.json({ error: "Authentication required" }, { status: 401 });
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
    void savePresence(user).catch(() => null);
    void saveEmployeePosition(authUser.id, body.user.position).catch(() => null);

    return Response.json({ ok: true });
  }

  if (body.type === "signal") {
    globalStore.gatherSignalSeq = (globalStore.gatherSignalSeq ?? 0) + 1;
    signals.push({
      id: globalStore.gatherSignalSeq,
      from: authUser.id,
      to: String(body.message.to),
      meetingId: String(body.message.meetingId),
      kind: body.message.kind,
      payload: body.message.payload,
      createdAt: Date.now(),
    });
    void createSignal({
      from: authUser.id,
      to: String(body.message.to),
      meetingId: String(body.message.meetingId),
      kind: body.message.kind,
      payload: body.message.payload,
    }).catch(() => null);

    return Response.json({ ok: true, id: globalStore.gatherSignalSeq });
  }

  if (body.type === "chat") {
    const text = String(body.message.body ?? "").trim();
    if (!text) {
      return Response.json({ error: "Message cannot be empty" }, { status: 400 });
    }

    const persistedMessage = await createChatMessage({
      channelId: String(body.message.channelId),
      fromId: authUser.id,
      fromName: authUser.name,
      body: text.slice(0, 2000),
    }).catch(() => null);
    if (persistedMessage) {
      return Response.json({ ok: true, message: persistedMessage });
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

    return Response.json({ ok: true, message });
  }

  if (body.type === "leave") {
    const userId = authUser.id;
    presence.delete(userId);
    void deletePresence(userId).catch(() => null);

    globalStore.gatherSignalSeq = (globalStore.gatherSignalSeq ?? 0) + 1;
    signals.push({
      id: globalStore.gatherSignalSeq,
      from: userId,
      to: "*",
      meetingId: "*",
      kind: "leave",
      payload: {},
      createdAt: Date.now(),
    });
    void createSignal({
      from: userId,
      to: "*",
      meetingId: "*",
      kind: "leave",
      payload: {},
    }).catch(() => null);

    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown realtime message" }, { status: 400 });
}
