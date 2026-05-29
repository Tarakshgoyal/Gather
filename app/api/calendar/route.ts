import { createCalendarEvent, createEventNotification, endCalendarEvent, listCalendarEvents, startCalendarEvent } from "@/app/lib/db";
import { getRequestUser } from "@/app/lib/request-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fallbackEvents: never[] = [];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rangeStart = url.searchParams.get("start");
  const rangeEnd = url.searchParams.get("end");
  const roomId = url.searchParams.get("roomId");
  const officeId = url.searchParams.get("officeId")?.trim() || "default";

  if (!rangeStart || !rangeEnd) {
    return Response.json({ error: "start and end are required" }, { status: 400 });
  }

  const events = await listCalendarEvents(rangeStart, rangeEnd, roomId === "all" ? null : roomId, officeId).catch(() => null);
  return Response.json({ events: events ?? fallbackEvents });
}

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json();
  const startAt = new Date(String(body.startAt));
  const endAt = new Date(String(body.endAt));
  const title = String(body.title ?? "").trim();
  const roomId = String(body.roomId ?? "").trim();
  const roomName = String(body.roomName ?? "").trim();
  const officeId = String(body.officeId ?? "default").trim() || "default";

  if (!title || !roomId || !roomName || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return Response.json({ error: "Invalid calendar event" }, { status: 400 });
  }

  const event = await createCalendarEvent({
    title: title.slice(0, 160),
    officeId,
    description: String(body.description ?? "").trim().slice(0, 2000),
    roomId,
    roomName,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    creatorId: user.id,
    creatorName: user.name,
  }).catch(() => null);

  if (!event) {
    return Response.json({ error: "Calendar database is unavailable" }, { status: 503 });
  }

  await createEventNotification(event, "created").catch(() => null);
  return Response.json({ event });
}

export async function PATCH(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json();
  const eventId = Number(body.eventId);
  const action = String(body.action ?? "start");
  const officeId = String(body.officeId ?? "default").trim() || "default";

  if (!Number.isInteger(eventId)) {
    return Response.json({ error: "eventId is required" }, { status: 400 });
  }

  if (action === "end") {
    const event = await endCalendarEvent(eventId, user.id, officeId).catch(() => null);
    if (!event) {
      return Response.json({ error: "Only the meeting creator can end a started meeting" }, { status: 403 });
    }
    return Response.json({ event });
  }

  const event = await startCalendarEvent(eventId, user.id, officeId).catch(() => null);
  if (!event) {
    return Response.json({ error: "Only the meeting creator can start this meeting" }, { status: 403 });
  }

  await createEventNotification(event, "started").catch(() => null);
  return Response.json({ event });
}
