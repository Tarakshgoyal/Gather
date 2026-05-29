# Gather Office

Next.js Gather-style office with persistent chat, calendar meetings, notifications, room NPC assistants, and WebRTC signaling.

## Local Development

```bash
npm install
npm run infra:up
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Local Docker uses:

```env
DATABASE_URL=postgres://gather:gather_dev_password@127.0.0.1:5432/gather
```

## Vercel Deployment

Use a hosted Postgres database such as Vercel Postgres, Neon, Supabase, or Railway. Docker Postgres, Redis, and Kafka are local-only helpers and are not used by the Vercel deployment.

1. Create a hosted Postgres database.
2. In Vercel Project Settings, add:

```env
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

3. Deploy with Vercel's default Next.js settings:

```bash
npm run build
```

The app creates its required tables automatically on first request:

- `chat_messages`
- `calendar_events`
- `notifications`
- `employee_positions`
- `realtime_presence`
- `realtime_signals`

## Notes

- API routes run on the Node.js runtime because the app uses `pg`.
- Presence and WebRTC signaling are persisted in Postgres so Vercel serverless instances can share office state.
- For production-scale realtime, move presence/signaling to a dedicated realtime service such as LiveKit, Ably, Pusher, or a small WebSocket server.
