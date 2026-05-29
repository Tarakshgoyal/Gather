export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { AccessToken } from "livekit-server-sdk";
import { getRequestJwtUser } from "@/app/lib/request-auth";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

function sanitizeRoomName(value: unknown) {
  const roomName = String(value ?? "").trim();
  if (!roomName || roomName.length > 128) return null;
  return roomName.replace(/[^a-zA-Z0-9:_-]/g, "-");
}

export async function POST(request: Request) {
  const authUser = getRequestJwtUser(request);
  if (!authUser) return Response.json({ error: "Authentication required" }, { status: 401, headers: noStoreHeaders });

  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!livekitUrl || !apiKey || !apiSecret) {
    return Response.json({ error: "LiveKit is not configured." }, { status: 500, headers: noStoreHeaders });
  }

  const body = await request.json().catch(() => ({}));
  const roomName = sanitizeRoomName(body.roomName);
  if (!roomName) return Response.json({ error: "Room name is required." }, { status: 400, headers: noStoreHeaders });

  const token = new AccessToken(apiKey, apiSecret, {
    identity: authUser.id,
    name: authUser.name,
    ttl: "2h",
    metadata: JSON.stringify({ email: authUser.email, skin: authUser.skin }),
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });

  return Response.json({
    serverUrl: livekitUrl,
    token: await token.toJwt(),
    roomName,
  }, { headers: noStoreHeaders });
}
