import { listNotifications, markNotificationRead } from "@/app/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const notifications = await listNotifications().catch(() => null);
  return Response.json({ notifications: notifications ?? [] });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { notificationId?: unknown } | null;
  const notificationId = Number(body?.notificationId);
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return Response.json({ error: "Valid notificationId is required." }, { status: 400 });
  }

  const notification = await markNotificationRead(notificationId).catch(() => null);
  if (!notification) {
    return Response.json({ error: "Notification not found." }, { status: 404 });
  }

  return Response.json({ notification });
}
