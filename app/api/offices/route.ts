import { createOfficeForUser, joinOfficeForUser, listUserOffices } from "@/app/lib/db";
import { getRequestUser } from "@/app/lib/request-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

  const offices = await listUserOffices(user.id).catch(() => null);
  if (!offices) return Response.json({ error: "Office database is unavailable" }, { status: 503 });
  return Response.json({ offices });
}

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null) as { action?: unknown; name?: unknown; code?: unknown } | null;
  const action = String(body?.action ?? "");

  if (action === "create") {
    const name = String(body?.name ?? "").trim();
    if (!name) return Response.json({ error: "Office name is required" }, { status: 400 });
    const office = await createOfficeForUser(user, name).catch(() => null);
    if (!office) return Response.json({ error: "Could not create office" }, { status: 503 });
    return Response.json({ office });
  }

  if (action === "join") {
    const code = String(body?.code ?? "").trim().toUpperCase();
    if (!code) return Response.json({ error: "Office ID is required" }, { status: 400 });
    const office = await joinOfficeForUser(user, code).catch(() => null);
    if (!office) return Response.json({ error: "No office found with that ID" }, { status: 404 });
    return Response.json({ office });
  }

  return Response.json({ error: "Unknown office action" }, { status: 400 });
}
