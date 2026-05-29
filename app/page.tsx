"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AtSign, Bell, Bot, CalendarDays, ChevronLeft, ChevronRight, CircleEllipsis, Clock3, Edit3, Gift, Hash, Lock, Map, MessageCircle, Network, Plus, RotateCw, Search, Send, Settings, Video, X } from "lucide-react";

type Direction = "down" | "up" | "left" | "right";
type Point = { x: number; y: number };
type Floor = "grass" | "wood" | "blue" | "gray" | "sand" | "rug" | "wall";
type MeetingMode = "room" | "proximity";
type RailTool = "gather" | "search" | "map" | "chat" | "calendar" | "notifications";
type MeetingZone = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
type RoomNpc = {
  id: string;
  zoneId: string;
  name: string;
  position: Point;
  skin: string;
};
type Person = {
  id: string;
  name: string;
  skin: string;
  position: Point;
  status: string;
  meetingId: string | null;
};
type EmployeeSession = {
  id: string;
  name: string;
  skin: string;
};
type ActiveMeeting = {
  id: string;
  mode: MeetingMode;
  title: string;
  participants: Person[];
  signal: string;
} | null;
type SignalMessage = {
  id: number;
  from: string;
  to: string;
  meetingId: string;
  kind: "offer" | "answer" | "ice" | "leave";
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit | Record<string, never>;
};
type ChatMessage = {
  id: number;
  channelId: string;
  fromId: string;
  fromName: string;
  body: string;
  createdAt: number;
};
type ChatChannel = {
  id: string;
  name: string;
  locked: boolean;
};
type CalendarEvent = {
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
type CalendarDraft = {
  title: string;
  description: string;
  roomId: string;
  date: string;
  startTime: string;
  endTime: string;
};
type AppNotification = {
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
type OfficeObject = {
  id: string;
  kind:
    | "wall"
    | "glass"
    | "desk"
    | "chair"
    | "meetingChair"
    | "table"
    | "roundTable"
    | "plant"
    | "tree"
    | "shelf"
    | "screen"
    | "whiteboard"
    | "sofa"
    | "lamp"
    | "cabinet"
    | "water"
    | "label";
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
  solid?: boolean;
};

const TILE = 32;
const COLS = 58;
const ROWS = 33;
const EMPLOYEE_STORAGE_KEY = "gather.employee.session";
const avatarStorageKey = (employeeId: string) => `gather.avatar.position:${employeeId}`;
const SKINS = ["001", "004", "012", "028", "043", "053", "067", "072", "079"];
const SIGNAL_URL = "/api/realtime";

const meetingZones: MeetingZone[] = [
  { id: "left-meet", name: "Left Meeting Room", x: 8, y: 3, w: 7, h: 10 },
  { id: "left-office", name: "Left Focus Room", x: 8, y: 13, w: 7, h: 9 },
  { id: "right-meet", name: "Right Meeting Room", x: 43, y: 3, w: 7, h: 10 },
  { id: "right-office", name: "Right Focus Room", x: 43, y: 13, w: 7, h: 9 },
  { id: "lounge", name: "Design Lounge", x: 17, y: 9, w: 9, h: 9 },
  { id: "team", name: "Team Desk Area", x: 30, y: 9, w: 11, h: 9 },
  { id: "bottom-left", name: "Cafe Lounge", x: 15, y: 22, w: 12, h: 9 },
  { id: "media", name: "Media Room", x: 27, y: 20, w: 15, h: 11 },
];

const objects: OfficeObject[] = [
  ...rectWalls(8, 1, 42, 30),
  ...roomWalls(8, 3, 7, 10),
  ...roomWalls(8, 13, 7, 9),
  ...roomWalls(43, 3, 7, 10),
  ...roomWalls(43, 13, 7, 9),
  ...roomWalls(27, 20, 15, 11),

  ...windows(9, 3, 4),
  ...windows(44, 3, 4),
  ...windows(9, 28, 4),
  ...windows(45, 28, 4),

  ...deskRow(31, 9, 4),
  ...deskRow(31, 14, 4),
  ...deskRow(34, 9, 4),
  ...deskRow(34, 14, 4),
  { id: "team-label", kind: "label", x: 35, y: 8, text: "Team" },

  ...loungeSet(18, 10),
  { id: "design-screen", kind: "screen", x: 10, y: 15, solid: true },
  { id: "design-board", kind: "whiteboard", x: 12, y: 15, w: 2, solid: true },
  ...chairCluster(11, 17),
  { id: "small-meeting-table", kind: "roundTable", x: 45, y: 6, w: 2, h: 2, solid: true },
  ...meetingChairs(45, 6),
  { id: "quiet-computer", kind: "screen", x: 45, y: 15, solid: true },
  { id: "quiet-shelf", kind: "shelf", x: 47, y: 15, w: 2, h: 1, solid: true },
  { id: "quiet-table", kind: "roundTable", x: 46, y: 18, w: 2, h: 2, solid: true },
  ...meetingChairs(46, 18),

  { id: "top-shelf-a", kind: "shelf", x: 19, y: 4, w: 3, h: 1, solid: true },
  { id: "top-shelf-b", kind: "shelf", x: 39, y: 4, w: 3, h: 1, solid: true },
  { id: "coffee", kind: "cabinet", x: 24, y: 4, w: 3, h: 1, solid: true },
  { id: "standup", kind: "screen", x: 34, y: 4, solid: true },
  { id: "welcome-board", kind: "whiteboard", x: 45, y: 4, w: 2, solid: true },

  { id: "bottom-couch", kind: "sofa", x: 16, y: 25, w: 3, h: 1, solid: true },
  { id: "bottom-table", kind: "roundTable", x: 19, y: 26, w: 2, h: 2, solid: true },
  { id: "bottom-whiteboard", kind: "whiteboard", x: 21, y: 23, w: 3, solid: true },
  { id: "bottom-screen", kind: "screen", x: 18, y: 23, solid: true },
  { id: "kitchen-counter", kind: "cabinet", x: 28, y: 23, w: 4, h: 1, solid: true },
  { id: "water-cooler", kind: "water", x: 46, y: 23, solid: true },
  { id: "media-table", kind: "table", x: 36, y: 26, w: 4, h: 2, solid: true },
  ...mediaChairs(36, 25),
  { id: "media-label", kind: "label", x: 34, y: 20, text: "Meeting room: Media room" },

  ...plants(),
  ...trees(),
];

const blocked = new Set<string>();
for (const item of objects) {
  if (!item.solid && item.kind !== "wall") continue;
  for (let y = item.y; y < item.y + (item.h ?? 1); y += 1) {
    for (let x = item.x; x < item.x + (item.w ?? 1); x += 1) {
      blocked.add(tileKey({ x, y }));
    }
  }
}

const roomNpcs: RoomNpc[] = meetingZones.map((zone, index) => ({
  id: `npc:${zone.id}`,
  zoneId: zone.id,
  name: `${zone.name} Assistant`,
  position: nearestOpenTile({ x: zone.x + Math.max(1, Math.floor(zone.w / 2)), y: zone.y + Math.max(1, Math.floor(zone.h / 2)) }),
  skin: SKINS[(index + 2) % SKINS.length],
}));

function tileKey(point: Point) {
  return `${point.x},${point.y}`;
}

function isInsideZone(point: Point, zone: MeetingZone) {
  return point.x >= zone.x && point.x < zone.x + zone.w && point.y >= zone.y && point.y < zone.y + zone.h;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function floorAt(x: number, y: number): Floor {
  const inside = x >= 8 && x <= 49 && y >= 1 && y <= 30;
  if (!inside) return "grass";
  if (x <= 14 && y <= 22) return y < 13 ? "gray" : "blue";
  if (x >= 43 && y <= 22) return y < 13 ? "gray" : "blue";
  if (x >= 17 && x <= 25 && y >= 9 && y <= 17) return "gray";
  if (x >= 30 && x <= 40 && y >= 9 && y <= 17) return "blue";
  if (x >= 27 && y >= 20) return "sand";
  if (x >= 15 && x <= 24 && y <= 5) return "blue";
  if (x >= 34 && x <= 43 && y <= 5) return "blue";
  if (x >= 16 && x <= 22 && y >= 24 && y <= 28) return "rug";
  return "wood";
}

function rectWalls(x: number, y: number, w: number, h: number): OfficeObject[] {
  return [
    { id: `wall-top-${x}-${y}`, kind: "wall", x, y, w, h: 1, solid: true },
    { id: `wall-bottom-${x}-${y}`, kind: "wall", x, y: y + h - 1, w, h: 1, solid: true },
    { id: `wall-left-${x}-${y}`, kind: "wall", x, y, w: 1, h, solid: true },
    { id: `wall-right-${x}-${y}`, kind: "wall", x: x + w - 1, y, w: 1, h, solid: true },
  ];
}

function roomWalls(x: number, y: number, w: number, h: number): OfficeObject[] {
  const walls: OfficeObject[] = [];
  const doorY = y + Math.floor(h / 2);
  const mediaDoorStart = x + Math.floor(w / 2) - 1;

  const isDoor = (wallX: number, wallY: number) => {
    if (x === 8 && wallX === x + w - 1 && (wallY === doorY || wallY === doorY + 1)) return true;
    if (x === 43 && wallX === x && (wallY === doorY || wallY === doorY + 1)) return true;
    if (x === 27 && y === 20 && wallY === y && wallX >= mediaDoorStart && wallX <= mediaDoorStart + 2) return true;
    return false;
  };

  for (let wallX = x; wallX < x + w; wallX += 1) {
    if (!isDoor(wallX, y)) walls.push({ id: `room-wall-top-${x}-${y}-${wallX}`, kind: "wall", x: wallX, y, solid: true });
    if (!isDoor(wallX, y + h - 1)) walls.push({ id: `room-wall-bottom-${x}-${y}-${wallX}`, kind: "wall", x: wallX, y: y + h - 1, solid: true });
  }

  for (let wallY = y + 1; wallY < y + h - 1; wallY += 1) {
    if (!isDoor(x, wallY)) walls.push({ id: `room-wall-left-${x}-${y}-${wallY}`, kind: "wall", x, y: wallY, solid: true });
    if (!isDoor(x + w - 1, wallY)) walls.push({ id: `room-wall-right-${x}-${y}-${wallY}`, kind: "wall", x: x + w - 1, y: wallY, solid: true });
  }

  return walls;
}

function windows(x: number, y: number, count: number): OfficeObject[] {
  return Array.from({ length: count }, (_, index) => ({ id: `window-${x}-${y}-${index}`, kind: "glass", x: x + index, y, w: 1, h: 1 }));
}

function deskRow(x: number, y: number, count: number): OfficeObject[] {
  return Array.from({ length: count }, (_, index) => [
    { id: `desk-${x}-${y}-${index}`, kind: "desk", x: x + index * 2, y, w: 2, h: 1, solid: true },
    { id: `chair-${x}-${y}-${index}`, kind: "chair", x: x + index * 2, y: y + 1 },
  ]).flat() as OfficeObject[];
}

function loungeSet(x: number, y: number): OfficeObject[] {
  return [
    { id: "lounge-shelf-a", kind: "shelf", x, y, w: 2, h: 3, solid: true },
    { id: "lounge-shelf-b", kind: "shelf", x: x + 5, y, w: 2, h: 3, solid: true },
    { id: "lounge-sofa-a", kind: "sofa", x: x + 1, y: y + 6, w: 3, h: 1, solid: true },
    { id: "lounge-sofa-b", kind: "sofa", x: x + 4, y: y + 6, w: 3, h: 1, solid: true },
    { id: "lounge-table", kind: "roundTable", x: x + 3, y: y + 3, w: 2, h: 2, solid: true },
    { id: "lounge-plant", kind: "plant", x: x + 6, y: y + 3, solid: true },
  ];
}

function chairCluster(x: number, y: number): OfficeObject[] {
  return [
    { id: "cluster-chair-a", kind: "chair", x, y },
    { id: "cluster-chair-b", kind: "chair", x: x + 2, y },
    { id: "cluster-chair-c", kind: "chair", x, y: y + 2 },
    { id: "cluster-chair-d", kind: "chair", x: x + 2, y: y + 2 },
    { id: "cluster-table", kind: "roundTable", x: x + 1, y: y + 1, solid: true },
  ];
}

function meetingChairs(x: number, y: number): OfficeObject[] {
  return [
    { id: `meet-chair-a-${x}-${y}`, kind: "chair", x: x - 1, y: y + 1 },
    { id: `meet-chair-b-${x}-${y}`, kind: "chair", x: x + 2, y: y + 1 },
    { id: `meet-chair-c-${x}-${y}`, kind: "chair", x: x + 1, y: y - 1 },
    { id: `meet-chair-d-${x}-${y}`, kind: "chair", x: x + 1, y: y + 2 },
  ];
}

function mediaChairs(x: number, y: number): OfficeObject[] {
  const top = Array.from({ length: 4 }, (_, index) => ({ id: `media-top-${index}`, kind: "meetingChair" as const, x: x + index, y }));
  const bottom = Array.from({ length: 4 }, (_, index) => ({ id: `media-bottom-${index}`, kind: "meetingChair" as const, x: x + index, y: y + 4 }));
  return [...top, ...bottom, { id: "media-left", kind: "meetingChair", x: x - 1, y: y + 2 }, { id: "media-right", kind: "meetingChair", x: x + 4, y: y + 2 }];
}

function plants(): OfficeObject[] {
  return [
    { x: 13, y: 5 }, { x: 15, y: 5 }, { x: 26, y: 5 }, { x: 33, y: 5 }, { x: 43, y: 5 },
    { x: 14, y: 16 }, { x: 25, y: 12 }, { x: 31, y: 23 }, { x: 47, y: 15 }, { x: 15, y: 23 },
  ].map((point, index) => ({ id: `plant-${index}`, kind: "plant", ...point, solid: true }));
}

function trees(): OfficeObject[] {
  return [
    { x: 2, y: 1 }, { x: 3, y: 16 }, { x: 2, y: 27 }, { x: 51, y: 2 }, { x: 51, y: 15 }, { x: 50, y: 26 },
  ].map((point, index) => ({ id: `tree-${index}`, kind: "tree", ...point, w: 3, h: 3, solid: true }));
}

function bfs(start: Point, end: Point): Point[] | null {
  if (blocked.has(tileKey(end))) return null;
  const directions = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }];
  const queue: Array<[Point, Point[]]> = [[start, [start]]];
  const visited = new Set([tileKey(start), ...blocked]);

  while (queue.length) {
    const [current, path] = queue.shift()!;
    if (current.x === end.x && current.y === end.y) return path.slice(1);
    for (const move of directions) {
      const next = { x: current.x + move.x, y: current.y + move.y };
      if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS || visited.has(tileKey(next))) continue;
      visited.add(tileKey(next));
      queue.push([next, [...path, next]]);
    }
  }
  return null;
}

function nearestOpenTile(point: Point) {
  if (!blocked.has(tileKey(point))) return point;
  for (let radius = 1; radius <= 6; radius += 1) {
    for (let y = point.y - radius; y <= point.y + radius; y += 1) {
      for (let x = point.x - radius; x <= point.x + radius; x += 1) {
        const next = { x, y };
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS && !blocked.has(tileKey(next))) return next;
      }
    }
  }
  return point;
}

export default function Home() {
  const [session, setSession] = useState<EmployeeSession | null>(null);
  const [authName, setAuthName] = useState("");
  const [avatar, setAvatar] = useState<Point>(() => {
    if (typeof window === "undefined" || !session) return { x: 25, y: 19 };
    const saved = window.localStorage.getItem(avatarStorageKey(session.id));
    if (!saved) return { x: 25, y: 19 };
    try {
      const parsed = JSON.parse(saved) as Point;
      return Number.isInteger(parsed.x) && Number.isInteger(parsed.y) ? parsed : { x: 25, y: 19 };
    } catch {
      return { x: 25, y: 19 };
    }
  });
  const [direction, setDirection] = useState<Direction>("down");
  const [walking, setWalking] = useState(false);
  const [ghostMode, setGhostMode] = useState(false);
  const [activeTool, setActiveTool] = useState<RailTool>("map");
  const [muted, setMuted] = useState(true);
  const [cameraOff, setCameraOff] = useState(true);
  const [remoteUsers, setRemoteUsers] = useState<Person[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState(`room:${meetingZones[0].id}`);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => startOfWeek(new Date()));
  const [calendarRoomId, setCalendarRoomId] = useState("all");
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarFormOpen, setCalendarFormOpen] = useState(false);
  const [calendarDraft, setCalendarDraft] = useState<CalendarDraft>(() => createInitialCalendarDraft(meetingZones[0].id));
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState<CalendarEvent | null>(null);
  const [calendarNotice, setCalendarNotice] = useState("");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeNpcId, setActiveNpcId] = useState<string | null>(null);
  const [npcDraft, setNpcDraft] = useState<CalendarDraft>(() => createInitialCalendarDraft(meetingZones[0].id));
  const [npcNotice, setNpcNotice] = useState("");
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const unreadNotificationCount = notifications.filter((notification) => !notification.readAt).length;
  const pathRef = useRef<Point[]>([]);
  const cameraRef = useRef<HTMLDivElement | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<EmployeeSession | null>(null);
  const activeMeetingIdRef = useRef<string | null>(null);
  const lastSignalIdRef = useRef(0);
  const lastChatIdRef = useRef(0);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    const saved = window.localStorage.getItem(EMPLOYEE_STORAGE_KEY);
    if (!saved) return;
    let timer: number | null = null;
    try {
      const parsed = JSON.parse(saved) as EmployeeSession;
      if (parsed.id && parsed.name && parsed.skin) {
        timer = window.setTimeout(() => setSession(parsed), 0);
      }
    } catch {
      window.localStorage.removeItem(EMPLOYEE_STORAGE_KEY);
    }
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    window.localStorage.setItem(avatarStorageKey(session.id), JSON.stringify(avatar));
  }, [avatar, session]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session) return;
    let stopped = false;
    const currentSession = session;

    async function restorePosition() {
      const query = new URLSearchParams({ userId: currentSession.id, after: "0", positionFor: currentSession.id });
      const response = await fetch(`${SIGNAL_URL}?${query.toString()}`).catch(() => null);
      if (!response?.ok || stopped) return;
      const data = await response.json() as { savedPosition?: Point | null };
      if (data.savedPosition && Number.isInteger(data.savedPosition.x) && Number.isInteger(data.savedPosition.y)) {
        setAvatar(data.savedPosition);
      }
    }

    void restorePosition();
    return () => {
      stopped = true;
    };
  }, [session]);

  const displayName = session?.name ?? "Guest";

  const signIn = useCallback(() => {
    const name = authName.trim();
    if (!name) return;
    const employee = {
      id: crypto.randomUUID(),
      name,
      skin: SKINS[Math.floor(Math.random() * SKINS.length)],
    };
    window.localStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(employee));
    const savedPosition = window.localStorage.getItem(avatarStorageKey(employee.id));
    if (savedPosition) {
      try {
        const parsed = JSON.parse(savedPosition) as Point;
        if (Number.isInteger(parsed.x) && Number.isInteger(parsed.y)) setAvatar(parsed);
      } catch {
        window.localStorage.removeItem(avatarStorageKey(employee.id));
      }
    }
    setSession(employee);
  }, [authName]);

  const signOut = useCallback(async () => {
    const current = sessionRef.current;
    if (current) {
      await fetch(SIGNAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "leave", userId: current.id }),
      }).catch(() => undefined);
    }
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams({});
    setRemoteUsers([]);
    window.localStorage.removeItem(EMPLOYEE_STORAGE_KEY);
    setSession(null);
  }, []);

  const markNotificationAsRead = useCallback(async (notificationId: number) => {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId }),
    }).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json() as { notification: AppNotification };
    setNotifications((current) => current.map((notification) => notification.id === data.notification.id ? data.notification : notification));
  }, []);

  const moveTo = useCallback((next: Point) => {
    if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS) return;
    if (!ghostMode && blocked.has(tileKey(next))) return;
    setAvatar((current) => {
      setDirection(next.x > current.x ? "right" : next.x < current.x ? "left" : next.y < current.y ? "up" : "down");
      return next;
    });
  }, [ghostMode]);

  const walkPath = useCallback((end: Point) => {
    const path = ghostMode ? [end] : bfs(avatar, end);
    if (!path?.length) return;
    pathRef.current = path;
    setWalking(true);
  }, [avatar, ghostMode]);

  useEffect(() => {
    if (!walking) return;
    const timer = window.setInterval(() => {
      const [next, ...rest] = pathRef.current;
      if (!next) {
        setWalking(false);
        window.clearInterval(timer);
        return;
      }
      pathRef.current = rest;
      moveTo(next);
    }, 78);
    return () => window.clearInterval(timer);
  }, [moveTo, walking]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, .npc-panel, .calendar-modal, .chat-composer")) return;
      const key = event.key.toLowerCase();
      if (key === "g") {
        setGhostMode((current) => !current);
        return;
      }
      const moves: Record<string, Point> = {
        arrowup: { x: avatar.x, y: avatar.y - 1 }, w: { x: avatar.x, y: avatar.y - 1 },
        arrowdown: { x: avatar.x, y: avatar.y + 1 }, s: { x: avatar.x, y: avatar.y + 1 },
        arrowleft: { x: avatar.x - 1, y: avatar.y }, a: { x: avatar.x - 1, y: avatar.y },
        arrowright: { x: avatar.x + 1, y: avatar.y }, d: { x: avatar.x + 1, y: avatar.y },
      };
      if (!moves[key]) return;
      event.preventDefault();
      pathRef.current = [];
      setWalking(false);
      moveTo(moves[key]);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [avatar, moveTo]);

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    camera.scrollLeft = 180;
    camera.scrollTop = 0;
  }, []);

  const showOfficeMap = useCallback(() => {
    setActiveTool("map");
    const camera = cameraRef.current;
    if (!camera) return;

    const targetLeft = avatar.x * TILE - camera.clientWidth / 2 + TILE / 2;
    const targetTop = avatar.y * TILE - camera.clientHeight / 2 + TILE / 2;
    camera.scrollTo({
      left: Math.max(0, targetLeft),
      top: Math.max(0, targetTop),
      behavior: "smooth",
    });
  }, [avatar]);

  const nearest = useMemo(() => remoteUsers
    .map((person) => ({ ...person, range: distance(person.position, avatar) }))
    .sort((a, b) => a.range - b.range)[0] ?? null, [avatar, remoteUsers]);

  const nearestNpc = useMemo(() => roomNpcs
    .map((npc) => ({ ...npc, range: distance(npc.position, avatar) }))
    .sort((a, b) => a.range - b.range)[0] ?? null, [avatar]);

  const currentZone = useMemo(
    () => meetingZones.find((zone) => isInsideZone(avatar, zone)) ?? null,
    [avatar],
  );

  const chatChannels = useMemo<ChatChannel[]>(() => meetingZones.map((zone) => ({
    id: `room:${zone.id}`,
    name: zone.name,
    locked: zone.id.includes("office") || zone.id === "media",
  })), []);

  const selectedChannel = useMemo(
    () => chatChannels.find((channel) => channel.id === selectedChannelId) ?? chatChannels[0],
    [chatChannels, selectedChannelId],
  );

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(calendarWeekStart, index)), [calendarWeekStart]);
  const calendarRooms = useMemo(() => meetingZones.map((zone) => ({ id: zone.id, name: zone.name })), []);
  const activeNpc = useMemo(() => roomNpcs.find((npc) => npc.id === activeNpcId) ?? null, [activeNpcId]);
  const activeNpcZone = useMemo(() => activeNpc ? meetingZones.find((zone) => zone.id === activeNpc.zoneId) ?? null : null, [activeNpc]);
  const activeNpcEvents = useMemo(() => {
    if (!activeNpcZone) return [];
    const recentCutoff = currentTime - 7 * 24 * 60 * 60 * 1000;
    return calendarEvents
      .filter((event) => event.roomId === activeNpcZone.id && new Date(event.endAt).getTime() >= recentCutoff)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [activeNpcZone, calendarEvents, currentTime]);

  const openNpcAssistant = useCallback((npc: RoomNpc) => {
    setActiveTool("map");
    setActiveNpcId(npc.id);
    setNpcDraft(createInitialCalendarDraft(npc.zoneId));
    setNpcNotice("");
  }, []);

  useEffect(() => {
    function onNpcKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, .npc-panel, .calendar-modal, .chat-composer")) return;
      if (event.key.toLowerCase() !== "x" || !nearestNpc || nearestNpc.range > 2.2) return;
      event.preventDefault();
      openNpcAssistant(nearestNpc);
    }

    window.addEventListener("keydown", onNpcKeyDown);
    return () => window.removeEventListener("keydown", onNpcKeyDown);
  }, [nearestNpc, openNpcAssistant]);

  const activeMeeting = useMemo(() => {
    if (!session) return null;

    if (currentZone) {
      const participants = remoteUsers.filter((person) => isInsideZone(person.position, currentZone));
      return {
        id: `room:${currentZone.id}`,
        mode: "room" as MeetingMode,
        title: currentZone.name,
        participants,
        signal: participants.length ? "Room call live" : "Room is ready",
      };
    }

    const nearby = remoteUsers
      .map((person) => ({ ...person, range: distance(person.position, avatar) }))
      .filter((person) => person.range <= 5)
      .sort((a, b) => a.range - b.range);

    if (nearby.length) {
      return {
        id: `proximity:${[session.id, ...nearby.map((person) => person.id)].sort().join(":")}`,
        mode: "proximity" as MeetingMode,
        title: nearby.length === 1 ? `Huddle with ${nearby[0].name}` : "Nearby huddle",
        participants: nearby,
        signal: "Proximity call live",
      };
    }

    return null;
  }, [avatar, currentZone, remoteUsers, session]);

  useEffect(() => {
    activeMeetingIdRef.current = activeMeeting?.id ?? null;
  }, [activeMeeting?.id]);

  const sendSignal = useCallback(async (message: Omit<SignalMessage, "id">) => {
    await fetch(SIGNAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "signal", message }),
    });
  }, []);

  const ensureLocalStream = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError("This browser cannot access camera/mic media.");
      return null;
    }

    const stream = localStreamRef.current ?? new MediaStream();
    const needsAudio = !muted && stream.getAudioTracks().length === 0;
    const needsVideo = !cameraOff && stream.getVideoTracks().length === 0;

    try {
      if (needsAudio || needsVideo) {
        const freshStream = await navigator.mediaDevices.getUserMedia({ audio: needsAudio, video: needsVideo });
        freshStream.getTracks().forEach((track) => stream.addTrack(track));
      }
      stream.getAudioTracks().forEach((track) => { track.enabled = !muted; });
      stream.getVideoTracks().forEach((track) => { track.enabled = !cameraOff; });
      localStreamRef.current = stream;
      setLocalStream(stream.getTracks().length ? new MediaStream(stream.getTracks()) : null);
      setMediaError(null);
      return stream;
    } catch {
      setMediaError("Camera or microphone permission is blocked.");
      return null;
    }
  }, [cameraOff, muted]);

  const addMissingTracks = useCallback((pc: RTCPeerConnection, stream: MediaStream | null) => {
    if (!stream) return;
    const senders = pc.getSenders();
    for (const track of stream.getTracks()) {
      if (!senders.some((sender) => sender.track === track)) pc.addTrack(track, stream);
    }
  }, []);

  const stopLocalTracks = useCallback((kind: "audio" | "video") => {
    const stream = localStreamRef.current;
    if (!stream) return;

    stream.getTracks()
      .filter((track) => track.kind === kind)
      .forEach((track) => {
        track.stop();
        stream.removeTrack(track);
      });

    Object.values(peerConnectionsRef.current).forEach((pc) => {
      pc.getSenders()
        .filter((sender) => sender.track?.kind === kind)
        .forEach((sender) => { void sender.replaceTrack(null); });
    });

    setLocalStream(stream.getTracks().length ? new MediaStream(stream.getTracks()) : null);
  }, []);

  const getPeerConnection = useCallback((remoteId: string) => {
    const existing = peerConnectionsRef.current[remoteId];
    const currentSession = sessionRef.current;
    if (existing || !currentSession) return existing;

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerConnectionsRef.current[remoteId] = pc;
    addMissingTracks(pc, localStreamRef.current);

    pc.onicecandidate = (event) => {
      if (!event.candidate || !activeMeetingIdRef.current) return;
      void sendSignal({
        from: currentSession.id,
        to: remoteId,
        meetingId: activeMeetingIdRef.current,
        kind: "ice",
        payload: event.candidate.toJSON(),
      });
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      setRemoteStreams((current) => ({ ...current, [remoteId]: stream }));
    };

    pc.onconnectionstatechange = () => {
      if (["closed", "failed", "disconnected"].includes(pc.connectionState)) {
        setRemoteStreams((current) => {
          const next = { ...current };
          delete next[remoteId];
          return next;
        });
      }
    };

    return pc;
  }, [addMissingTracks, sendSignal]);

  const closePeer = useCallback((remoteId: string) => {
    peerConnectionsRef.current[remoteId]?.close();
    delete peerConnectionsRef.current[remoteId];
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[remoteId];
      return next;
    });
  }, []);

  const processSignal = useCallback(async (message: SignalMessage) => {
    const currentSession = sessionRef.current;
    if (!currentSession || message.from === currentSession.id) return;

    if (message.kind === "leave") {
      closePeer(message.from);
      return;
    }

    if (message.meetingId !== activeMeetingIdRef.current) return;
    const pc = getPeerConnection(message.from);
    if (!pc) return;

    if (message.kind === "offer") {
      const stream = await ensureLocalStream();
      addMissingTracks(pc, stream);
      await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal({ from: currentSession.id, to: message.from, meetingId: message.meetingId, kind: "answer", payload: answer });
      return;
    }

    if (message.kind === "answer" && pc.signalingState !== "stable") {
      await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      return;
    }

    if (message.kind === "ice") {
      await pc.addIceCandidate(message.payload as RTCIceCandidateInit).catch(() => undefined);
    }
  }, [addMissingTracks, closePeer, ensureLocalStream, getPeerConnection, sendSignal]);

  useEffect(() => {
    if (!session) return;
    let stopped = false;

    async function syncPresence() {
      const currentSession = sessionRef.current;
      if (!currentSession) return;
      await fetch(SIGNAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "presence",
          user: {
            id: currentSession.id,
            name: currentSession.name,
            skin: currentSession.skin,
            position: avatar,
            status: activeMeeting ? activeMeeting.title : "Available",
            meetingId: activeMeeting?.id ?? null,
          },
        }),
      }).catch(() => undefined);
    }

    void syncPresence();
    const timer = window.setInterval(() => {
      if (!stopped) void syncPresence();
    }, 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeMeeting, avatar, session]);

  useEffect(() => {
    if (!session) return;
    let stopped = false;

    async function poll() {
      const currentSession = sessionRef.current;
      if (!currentSession) return;
      const query = new URLSearchParams({ userId: currentSession.id, after: String(lastSignalIdRef.current) });
      const response = await fetch(`${SIGNAL_URL}?${query.toString()}`).catch(() => null);
      if (!response?.ok || stopped) return;
      const data = await response.json() as { users: Person[]; signals: SignalMessage[]; latestSignalId: number };
      setRemoteUsers(data.users.filter((user) => user.id !== currentSession.id));
      lastSignalIdRef.current = data.latestSignalId;
      for (const signal of data.signals) await processSignal(signal);
    }

    void poll();
    const timer = window.setInterval(() => {
      if (!stopped) void poll();
    }, 900);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [processSignal, session]);

  useEffect(() => {
    if (!session) return;
    let stopped = false;
    const currentSession = session;

    async function pollChat() {
      const query = new URLSearchParams({
        userId: currentSession.id,
        after: String(lastSignalIdRef.current),
        channelId: selectedChannelId,
        afterChat: String(lastChatIdRef.current),
      });
      const response = await fetch(`${SIGNAL_URL}?${query.toString()}`).catch(() => null);
      if (!response?.ok || stopped) return;
      const data = await response.json() as { chatMessages: ChatMessage[]; latestChatId: number };
      if (data.chatMessages.length) {
        setChatMessages((current) => mergeChatMessages(current, data.chatMessages).slice(-250));
      }
      lastChatIdRef.current = data.latestChatId;
    }

    lastChatIdRef.current = 0;
    const resetTimer = window.setTimeout(() => {
      setChatMessages([]);
      void pollChat();
    }, 0);
    const timer = window.setInterval(() => {
      if (!stopped) void pollChat();
    }, 1000);
    return () => {
      stopped = true;
      window.clearTimeout(resetTimer);
      window.clearInterval(timer);
    };
  }, [selectedChannelId, session]);

  const sendChatMessage = useCallback(async () => {
    const currentSession = sessionRef.current;
    const body = chatDraft.trim();
    if (!currentSession || !body) return;

    setChatDraft("");
    const response = await fetch(SIGNAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "chat",
        message: {
          channelId: selectedChannelId,
          fromId: currentSession.id,
          fromName: currentSession.name,
          body,
        },
      }),
    }).catch(() => {
      setChatDraft(body);
      return null;
    });
    if (!response?.ok) return;

    const data = await response.json() as { message?: ChatMessage };
    if (data.message) {
      lastChatIdRef.current = Math.max(lastChatIdRef.current, data.message.id);
      setChatMessages((current) => current.some((message) => message.id === data.message?.id)
        ? current
        : [...current, data.message as ChatMessage].slice(-250));
    }
  }, [chatDraft, selectedChannelId]);

  useEffect(() => {
    let stopped = false;

    async function loadEvents() {
      const rangeStart = calendarWeekStart.toISOString();
      const rangeEnd = addDays(calendarWeekStart, 7).toISOString();
      const query = new URLSearchParams({ start: rangeStart, end: rangeEnd, roomId: calendarRoomId });
      const response = await fetch(`/api/calendar?${query.toString()}`).catch(() => null);
      if (!response?.ok || stopped) return;
      const data = await response.json() as { events: CalendarEvent[] };
      setCalendarEvents(data.events);
    }

    void loadEvents();
    const timer = window.setInterval(() => {
      if (!stopped) void loadEvents();
    }, 15_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [calendarRoomId, calendarWeekStart]);

  const createCalendarMeeting = useCallback(async () => {
    if (!session) return;
    const room = calendarRooms.find((item) => item.id === calendarDraft.roomId);
    if (!room) return;

    const startAt = new Date(`${calendarDraft.date}T${calendarDraft.startTime}`);
    const endAt = new Date(`${calendarDraft.date}T${calendarDraft.endTime}`);
    if (!calendarDraft.title.trim() || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) return;

    const response = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: calendarDraft.title,
        description: calendarDraft.description,
        roomId: room.id,
        roomName: room.name,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        creatorId: session.id,
        creatorName: session.name,
      }),
    }).catch(() => null);

    if (!response?.ok) return;
    const data = await response.json() as { event: CalendarEvent };
    setCalendarEvents((current) => [...current, data.event].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()));
    setCalendarDraft(createInitialCalendarDraft(room.id));
    setCalendarFormOpen(false);
  }, [calendarDraft, calendarRooms, session]);

  const createNpcMeeting = useCallback(async () => {
    if (!session || !activeNpcZone) return;
    const startAt = new Date(`${npcDraft.date}T${npcDraft.startTime}`);
    const endAt = new Date(`${npcDraft.date}T${npcDraft.endTime}`);
    if (!npcDraft.title.trim() || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      setNpcNotice("Add a valid title, start time, and end time.");
      window.setTimeout(() => setNpcNotice(""), 2800);
      return;
    }

    const response = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: npcDraft.title,
        description: npcDraft.description,
        roomId: activeNpcZone.id,
        roomName: activeNpcZone.name,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        creatorId: session.id,
        creatorName: session.name,
      }),
    }).catch(() => null);

    if (!response?.ok) {
      setNpcNotice("Meeting could not be created.");
      window.setTimeout(() => setNpcNotice(""), 2800);
      return;
    }

    const data = await response.json() as { event: CalendarEvent };
    setCalendarEvents((current) => [...current, data.event].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()));
    setNpcDraft(createInitialCalendarDraft(activeNpcZone.id));
    setNpcNotice("Meeting created for this room.");
    window.setTimeout(() => setNpcNotice(""), 2800);
  }, [activeNpcZone, npcDraft, session]);

  const startCalendarMeeting = useCallback(async (event: CalendarEvent) => {
    if (!session || event.creatorId !== session.id) return;
    const response = await fetch("/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id, creatorId: session.id }),
    }).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json() as { event: CalendarEvent };
    setCalendarEvents((current) => current.map((item) => item.id === data.event.id ? data.event : item));
    setSelectedCalendarEvent(data.event);
    setCalendarNotice("Meeting started. Teammates can join now.");
    window.setTimeout(() => setCalendarNotice(""), 2800);
  }, [session]);

  const startNpcMeeting = useCallback(async (event: CalendarEvent) => {
    if (!session || event.creatorId !== session.id) {
      setNpcNotice("Only the creator can start this meeting.");
      window.setTimeout(() => setNpcNotice(""), 2800);
      return;
    }

    const response = await fetch("/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id, creatorId: session.id }),
    }).catch(() => null);

    if (!response?.ok) {
      setNpcNotice("Only the creator can start this meeting.");
      window.setTimeout(() => setNpcNotice(""), 2800);
      return;
    }

    const data = await response.json() as { event: CalendarEvent };
    setCalendarEvents((current) => current.map((item) => item.id === data.event.id ? data.event : item));
    setNpcNotice("Meeting started. Teammates can join now.");
    window.setTimeout(() => setNpcNotice(""), 2800);
  }, [session]);

  const joinCalendarMeeting = useCallback((event: CalendarEvent) => {
    if (!event.liveStartedAt) {
      setCalendarNotice("Meeting has not been started yet.");
      window.setTimeout(() => setCalendarNotice(""), 2800);
      return;
    }

    const zone = meetingZones.find((item) => item.id === event.roomId);
    if (!zone) return;
    const point = nearestOpenTile({ x: zone.x + Math.floor(zone.w / 2), y: zone.y + Math.floor(zone.h / 2) });
    pathRef.current = [];
    setWalking(false);
    setAvatar(point);
    setSelectedCalendarEvent(null);
    setActiveTool("map");
    window.setTimeout(() => showOfficeMap(), 50);
  }, [showOfficeMap]);

  const joinNpcMeeting = useCallback((event: CalendarEvent) => {
    if (!event.liveStartedAt) {
      setNpcNotice("Meeting has not been started yet.");
      window.setTimeout(() => setNpcNotice(""), 2800);
      return;
    }

    const zone = meetingZones.find((item) => item.id === event.roomId);
    if (!zone) return;
    const point = nearestOpenTile({ x: zone.x + Math.floor(zone.w / 2), y: zone.y + Math.floor(zone.h / 2) });
    pathRef.current = [];
    setWalking(false);
    setAvatar(point);
    setActiveNpcId(null);
    setActiveTool("map");
    window.setTimeout(() => showOfficeMap(), 50);
  }, [showOfficeMap]);

  useEffect(() => {
    let stopped = false;

    async function loadNotifications() {
      const response = await fetch("/api/notifications").catch(() => null);
      if (!response?.ok || stopped) return;
      const data = await response.json() as { notifications: AppNotification[] };
      setNotifications(data.notifications);
    }

    void loadNotifications();
    const timer = window.setInterval(() => {
      if (!stopped) void loadNotifications();
    }, 30_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!activeMeeting || !session) {
      Object.keys(peerConnectionsRef.current).forEach(closePeer);
      return;
    }

    const meeting = activeMeeting;
    const currentSession = session;
    const participantIds = new Set(meeting.participants.map((person) => person.id));
    Object.keys(peerConnectionsRef.current).forEach((remoteId) => {
      if (!participantIds.has(remoteId)) closePeer(remoteId);
    });

    async function connectParticipants() {
      const stream = await ensureLocalStream();
      for (const participant of meeting.participants) {
        const pc = getPeerConnection(participant.id);
        if (!pc) continue;
        const needsOffer = !!stream && stream.getTracks().some((track) => !pc.getSenders().some((sender) => sender.track === track));
        addMissingTracks(pc, stream);
        if (currentSession.id < participant.id && pc.signalingState === "stable" && (!pc.localDescription || needsOffer)) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal({ from: currentSession.id, to: participant.id, meetingId: meeting.id, kind: "offer", payload: offer });
        }
      }
    }

    void connectParticipants();
  }, [activeMeeting, addMissingTracks, closePeer, ensureLocalStream, getPeerConnection, sendSignal, session]);

  useEffect(() => {
    if (muted) stopLocalTracks("audio");
    if (cameraOff) stopLocalTracks("video");
    const timer = window.setTimeout(() => {
      if ((!muted || !cameraOff) && activeMeeting) void ensureLocalStream();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeMeeting, cameraOff, ensureLocalStream, muted, stopLocalTracks]);

  useEffect(() => () => {
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  return (
    <>
      {!session ? <AuthDialog authName={authName} setAuthName={setAuthName} signIn={signIn} /> : null}
      <main className={activeTool === "calendar" || activeTool === "notifications" ? "gather-shell calendar-shell" : "gather-shell"}>
        <LeftRail activeTool={activeTool} notificationCount={unreadNotificationCount} onSelectTool={setActiveTool} onShowMap={showOfficeMap} />
        {activeTool === "chat" ? (
          <ChatWorkspace
            channels={chatChannels}
            selectedChannel={selectedChannel}
            selectedChannelId={selectedChannelId}
            onSelectChannel={setSelectedChannelId}
            messages={chatMessages}
            draft={chatDraft}
            setDraft={setChatDraft}
            sendMessage={sendChatMessage}
            session={session}
            employees={remoteUsers}
          />
        ) : activeTool === "calendar" ? (
          <CalendarWorkspace
            rooms={calendarRooms}
            weekDays={weekDays}
            weekStart={calendarWeekStart}
            setWeekStart={setCalendarWeekStart}
            roomId={calendarRoomId}
            setRoomId={setCalendarRoomId}
            events={calendarEvents}
            selectedEvent={selectedCalendarEvent}
            setSelectedEvent={setSelectedCalendarEvent}
            notice={calendarNotice}
            formOpen={calendarFormOpen}
            setFormOpen={setCalendarFormOpen}
            draft={calendarDraft}
            setDraft={setCalendarDraft}
            createMeeting={createCalendarMeeting}
            startMeeting={startCalendarMeeting}
            joinMeeting={joinCalendarMeeting}
            session={session}
          />
        ) : activeTool === "notifications" ? (
          <NotificationsWorkspace notifications={notifications} onMarkAsRead={markNotificationAsRead} />
        ) : (
          <>
            <aside className="people-drawer">
              <div className="drawer-top"><h1>abcde</h1><button aria-label="Collapse sidebar" className="tiny-icon">||</button></div>
              <section className="invite-panel">
                <h2>Experience Gather together</h2>
                <p>Invite your closest collaborators.</p>
                <div className="invite-faces">{["A", "B", "C", "D", "E"].map((face, index) => <span aria-hidden="true" className={`invite-face face-${index}`} key={face}><span /></span>)}</div>
                <button className="invite-button"><span>Invite</span><span className="copy-mark">link</span></button>
              </section>
              <label className="search-box account-box">
                <input aria-label="Employee name" disabled placeholder="Sign in as an employee" value={session?.name ?? ""} />
                {session ? <button className="signout-button" onClick={signOut}>Sign out</button> : null}
              </label>
              <section className="online-list">
                <button className="online-heading">Online ({remoteUsers.length + (session ? 1 : 0)})</button>
                {session ? <PersonRow name={displayName} status={activeMeeting?.title ?? "Active"} tone="self" /> : null}
                {remoteUsers.map((person) => <PersonRow key={person.id} name={person.name} status={person.status} tone={person.skin} />)}
              </section>
            </aside>

            <section className="world-viewport" aria-label="Office game world">
              <div className="office-camera" ref={cameraRef}>
                <div className="office-map" style={{ width: COLS * TILE, height: ROWS * TILE }}>
                  {Array.from({ length: ROWS * COLS }, (_, index) => {
                    const x = index % COLS;
                    const y = Math.floor(index / COLS);
                    return <button aria-label={`Move to ${x}, ${y}`} className={`office-tile tile-${floorAt(x, y)}`} key={`${x}-${y}`} style={{ left: x * TILE, top: y * TILE }} onClick={() => walkPath({ x, y })} />;
                  })}
                  <OfficeZones />
                  {[...objects].sort((a, b) => a.y - b.y).map((item) => <OfficeObjectView item={item} key={item.id} />)}
                  {roomNpcs.map((npc) => (
                    <Character
                      key={npc.id}
                      name={nearestNpc?.id === npc.id && nearestNpc.range <= 2.2 ? "Press X" : npc.name}
                      skin={npc.skin}
                      position={npc.position}
                      direction="down"
                      npc
                      onInteract={() => openNpcAssistant(npc)}
                    />
                  ))}
                  {remoteUsers.map((person) => <Character key={person.id} name={person.name} skin={person.skin} position={person.position} direction="down" />)}
                  {session ? <Character name={displayName} skin={session.skin} position={avatar} direction={direction} walking={walking} self /> : null}
                </div>
              </div>

              <div className="map-overlay top-status">
                <span className="pulse-dot" />
                <span>{activeMeeting ? activeMeeting.signal : ghostMode ? "Ghost mode" : "Office environment"}</span>
                <strong>{activeMeeting ? activeMeeting.title : nearestNpc && nearestNpc.range <= 2.2 ? `Assistant nearby: press X` : nearest ? `Nearest: ${nearest.name}` : "Waiting for employees"}</strong>
              </div>
              <div className="map-overlay mini-map"><span className="mini-room mini-one" /><span className="mini-room mini-two" /><span className="mini-room mini-three" /><span className="mini-you" style={{ left: `${(avatar.x / COLS) * 100}%`, top: `${(avatar.y / ROWS) * 100}%` }} /></div>
              <div className="map-overlay bottom-controls">
                <div className="self-chip"><span className="avatar-head">{displayName[0]}</span><span className="presence-dot" /></div>
                <button className={muted ? "control danger" : "control"} onClick={() => setMuted((current) => !current)}>Mic</button>
                <button className={cameraOff ? "control danger" : "control"} onClick={() => setCameraOff((current) => !current)}>Cam</button>
                <button className="control">Smile</button><button className="control">Wave</button><button className="control">Share</button>
              </div>
              <div className="map-overlay coordinates"><span>x {avatar.x}, y {avatar.y}</span><span>Press G for ghost</span></div>
              <MeetingPanel activeMeeting={activeMeeting} displayName={displayName} localSkin={session?.skin ?? "001"} muted={muted} cameraOff={cameraOff} localStream={localStream} remoteStreams={remoteStreams} mediaError={mediaError} />
              {activeNpc && activeNpcZone ? (
                <NpcAssistantPanel
                  draft={npcDraft}
                  events={activeNpcEvents}
                  notice={npcNotice}
                  npc={activeNpc}
                  onClose={() => setActiveNpcId(null)}
                  onCreate={createNpcMeeting}
                  onDraftChange={setNpcDraft}
                  onJoin={joinNpcMeeting}
                  onStart={startNpcMeeting}
                  session={session}
                  currentTime={currentTime}
                  zone={activeNpcZone}
                />
              ) : null}
            </section>
            <RightRail />
          </>
        )}
      </main>
    </>
  );
}

function OfficeZones() {
  const zones = [
    { id: "main", className: "zone-main", x: 8, y: 1, w: 42, h: 30 },
    { id: "top-left", className: "zone-blue", x: 15, y: 1, w: 10, h: 5 },
    { id: "top-right", className: "zone-blue", x: 34, y: 1, w: 10, h: 5 },
    { id: "left-meet", className: "zone-gray", x: 8, y: 3, w: 7, h: 10 },
    { id: "left-office", className: "zone-blue", x: 8, y: 13, w: 7, h: 9 },
    { id: "right-meet", className: "zone-gray", x: 43, y: 3, w: 7, h: 10 },
    { id: "right-office", className: "zone-blue", x: 43, y: 13, w: 7, h: 9 },
    { id: "lounge", className: "zone-gray", x: 17, y: 9, w: 9, h: 9 },
    { id: "team", className: "zone-blue", x: 30, y: 9, w: 11, h: 9 },
    { id: "bottom-left", className: "zone-light", x: 15, y: 22, w: 12, h: 9 },
    { id: "media", className: "zone-sand", x: 27, y: 20, w: 15, h: 11 },
    { id: "media-purple", className: "zone-purple", x: 34, y: 22, w: 8, h: 3 },
    { id: "lounge-rug", className: "zone-rug", x: 16, y: 24, w: 7, h: 5 },
  ];

  return (
    <>
      {zones.map((zone) => (
        <span
          className={`office-zone ${zone.className}`}
          key={zone.id}
          style={{ left: zone.x * TILE, top: zone.y * TILE, width: zone.w * TILE, height: zone.h * TILE }}
        />
      ))}
    </>
  );
}

function OfficeObjectView({ item }: { item: OfficeObject }) {
  const style: CSSProperties = {
    left: item.x * TILE,
    top: item.y * TILE,
    width: (item.w ?? 1) * TILE,
    height: (item.h ?? 1) * TILE,
    zIndex: item.y * TILE + (item.h ?? 1) * TILE + 10,
  };
  return <span className={`office-object object-${item.kind}`} style={style}>{item.text ? <span>{item.text}</span> : null}</span>;
}

function Character({
  name,
  skin,
  position,
  direction,
  walking,
  self,
  npc,
  onInteract,
}: {
  name: string;
  skin: string;
  position: Point;
  direction: Direction;
  walking?: boolean;
  self?: boolean;
  npc?: boolean;
  onInteract?: () => void;
}) {
  const row = { down: 0, left: 48, right: 96, up: 144 }[direction];
  const frame = walking ? 96 : 48;
  const className = `${self ? "character character-self" : "character"} ${npc ? "character-npc" : ""}`;
  const style: CSSProperties = { left: position.x * TILE + 16 - 24, top: position.y * TILE + 24 - 48, zIndex: position.y * TILE + 80 };
  const content = (
    <>
      <span className="name-plate">{name}</span>
      <span className="character-sprite" style={{ backgroundImage: `url(/sprites/characters/Character_${skin}.png)`, backgroundPosition: `-${frame}px -${row}px` }} />
    </>
  );

  if (onInteract) {
    return (
    <button
      aria-label={`Talk to ${name}`}
      className={className}
      onClick={onInteract}
      style={style}
      type="button"
    >
      {content}
    </button>
    );
  }

  return <div className={className} style={style}>{content}</div>;
}

function NpcAssistantPanel({
  draft,
  events,
  notice,
  npc,
  onClose,
  onCreate,
  onDraftChange,
  onJoin,
  onStart,
  session,
  currentTime,
  zone,
}: {
  draft: CalendarDraft;
  events: CalendarEvent[];
  notice: string;
  npc: RoomNpc;
  onClose: () => void;
  onCreate: () => void;
  onDraftChange: (draft: CalendarDraft) => void;
  onJoin: (event: CalendarEvent) => void;
  onStart: (event: CalendarEvent) => void;
  session: EmployeeSession | null;
  currentTime: number;
  zone: MeetingZone;
}) {
  return (
    <aside className="npc-panel" aria-label={`${zone.name} assistant`}>
      <header className="npc-panel-header">
        <div>
          <span className="npc-panel-icon"><Bot size={20} /></span>
          <span>
            <small>{npc.name}</small>
            <strong>{zone.name}</strong>
          </span>
        </div>
        <button aria-label="Close room assistant" onClick={onClose} type="button"><X size={18} /></button>
      </header>
      {notice ? <p className="npc-notice">{notice}</p> : null}
      <section className="npc-section">
        <h2>Upcoming in this room</h2>
          {events.length ? (
          <div className="npc-event-list">
            {events.map((event) => {
              const isCreator = session?.id === event.creatorId;
              const ended = new Date(event.endAt).getTime() < currentTime;
              return (
                <article className={`${event.liveStartedAt ? "npc-event npc-event-live" : "npc-event"} ${ended ? "npc-event-past" : ""}`} key={event.id}>
                  <div>
                    <strong>{event.title}</strong>
                    <span>{formatEventDateTime(event.startAt)} · {formatTimeRange(event.startAt, event.endAt)}</span>
                    <small>{event.creatorName}{event.liveStartedAt ? " · live now" : ended ? " · completed" : ""}</small>
                  </div>
                  <div className="npc-event-actions">
                    {isCreator && !event.liveStartedAt && !ended ? <button type="button" onClick={() => onStart(event)}><Video size={16} /> Start</button> : null}
                    {!ended ? <button type="button" onClick={() => onJoin(event)}>Join</button> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="npc-empty">No recent or upcoming meetings are scheduled for this room.</p>
        )}
      </section>
      <form
        className="npc-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <h2>Create in this room</h2>
        <input aria-label="Meeting title" placeholder="Meeting title" value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} required />
        <textarea aria-label="Meeting notes" placeholder="Agenda, event notes, or deadline details" value={draft.description} onChange={(event) => onDraftChange({ ...draft, description: event.target.value })} />
        <div className="npc-form-row">
          <input aria-label="Date" type="date" value={draft.date} onChange={(event) => onDraftChange({ ...draft, date: event.target.value })} required />
          <input aria-label="Start time" type="time" value={draft.startTime} onChange={(event) => onDraftChange({ ...draft, startTime: event.target.value })} required />
          <input aria-label="End time" type="time" value={draft.endTime} onChange={(event) => onDraftChange({ ...draft, endTime: event.target.value })} required />
        </div>
        <button disabled={!session} type="submit"><Plus size={17} /> Create meeting</button>
      </form>
    </aside>
  );
}

function MeetingPanel({
  activeMeeting,
  displayName,
  localSkin,
  muted,
  cameraOff,
  localStream,
  remoteStreams,
  mediaError,
}: {
  activeMeeting: ActiveMeeting;
  displayName: string;
  localSkin: string;
  muted: boolean;
  cameraOff: boolean;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  mediaError: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!activeMeeting) {
    return (
      <aside className="meeting-panel meeting-panel-idle">
        <div>
          <span className="meeting-kicker">Auto meetings</span>
          <strong>Walk near someone or enter a room</strong>
        </div>
        <p>Proximity starts within 5 tiles. Private rooms connect everyone inside.</p>
      </aside>
    );
  }

  return (
    <aside className={expanded ? "meeting-panel meeting-panel-live meeting-panel-expanded" : "meeting-panel meeting-panel-live"}>
      <div className="meeting-header">
        <span className="live-dot" />
        <div>
          <span className="meeting-kicker">{activeMeeting.mode === "room" ? "Room meeting" : "Proximity huddle"}</span>
          <strong>{activeMeeting.title}</strong>
        </div>
        <button className="meeting-action" type="button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? "Minimize" : "Maximize"}
        </button>
        <span className="meeting-time">Live</span>
      </div>

      {mediaError ? <p className="media-error">{mediaError}</p> : null}
      <div className="meeting-grid">
        <ParticipantTile name={displayName} skin={localSkin} label={muted ? "You · muted" : "You · live"} active={!cameraOff} stream={localStream} muted />
        {activeMeeting.participants.map((person) => (
          <ParticipantTile key={person.id} name={person.name} skin={person.skin} label={person.status} active stream={remoteStreams[person.id]} />
        ))}
      </div>

      <div className="meeting-footer">
        <span>{activeMeeting.signal}</span>
        <span>{muted ? "Mic muted" : "Mic on"}</span>
        <span>{cameraOff ? "Camera off" : "Camera on"}</span>
      </div>
    </aside>
  );
}

function ParticipantTile({
  name,
  skin,
  label,
  active,
  stream,
  muted,
}: {
  name: string;
  skin: string;
  label: string;
  active: boolean;
  stream?: MediaStream | null;
  muted?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream ?? null;
  }, [stream]);

  return (
    <div className={active ? "participant-tile participant-active" : "participant-tile"}>
      {stream ? (
        <video className="participant-video" ref={videoRef} autoPlay playsInline muted={muted} />
      ) : (
        <span className="participant-avatar" style={{ backgroundImage: `url(/sprites/characters/Character_${skin}.png)` }} />
      )}
      <strong>{name}</strong>
      <small>{label}</small>
    </div>
  );
}

function AuthDialog({
  authName,
  setAuthName,
  signIn,
}: {
  authName: string;
  setAuthName: (name: string) => void;
  signIn: () => void;
}) {
  return (
    <div className="auth-backdrop" role="dialog" aria-modal="true" aria-label="Employee sign in">
      <section className="auth-card">
        <span className="auth-kicker">Gather office</span>
        <h2>Join as a real employee</h2>
        <p>Enter your name, then open this same URL in another browser or device to test live proximity and room meetings with actual people.</p>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            signIn();
          }}
        >
          <input autoFocus aria-label="Employee name" placeholder="Your name" value={authName} onChange={(event) => setAuthName(event.target.value)} />
          <button type="submit">Enter office</button>
        </form>
      </section>
    </div>
  );
}

function CalendarWorkspace({
  rooms,
  weekDays,
  weekStart,
  setWeekStart,
  roomId,
  setRoomId,
  events,
  selectedEvent,
  setSelectedEvent,
  notice,
  formOpen,
  setFormOpen,
  draft,
  setDraft,
  createMeeting,
  startMeeting,
  joinMeeting,
  session,
}: {
  rooms: Array<{ id: string; name: string }>;
  weekDays: Date[];
  weekStart: Date;
  setWeekStart: (date: Date) => void;
  roomId: string;
  setRoomId: (roomId: string) => void;
  events: CalendarEvent[];
  selectedEvent: CalendarEvent | null;
  setSelectedEvent: (event: CalendarEvent | null) => void;
  notice: string;
  formOpen: boolean;
  setFormOpen: (open: boolean) => void;
  draft: CalendarDraft;
  setDraft: (draft: CalendarDraft) => void;
  createMeeting: () => void;
  startMeeting: (event: CalendarEvent) => void;
  joinMeeting: (event: CalendarEvent) => void;
  session: EmployeeSession | null;
}) {
  const today = new Date();
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const weekEvents = events
    .filter((event) => weekDays.some((day) => isSameDay(new Date(event.startAt), day)))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const todayEvents = weekEvents.filter((event) => isSameDay(new Date(event.startAt), today));
  const recentEvents = weekEvents
    .filter((event) => new Date(event.startAt).getTime() <= today.getTime() || event.liveStartedAt)
    .slice(-8)
    .reverse();

  return (
    <section className="calendar-workspace" aria-label="Calendar">
      <aside className="calendar-sidebar">
        <header className="calendar-sidebar-header"><h1>Calendar</h1></header>
        <section className="invite-panel calendar-invite">
          <h2>Experience Gather together</h2>
          <p>Invite your closest collaborators.</p>
          <div className="invite-faces">{["A", "B", "C", "D", "E"].map((face, index) => <span aria-hidden="true" className={`invite-face face-${index}`} key={face}><span /></span>)}</div>
          <button className="invite-button"><span>Invite</span><span className="copy-mark">link</span></button>
        </section>
        <label className="chat-search calendar-search">
          <Search size={17} />
          <input placeholder="Search events" />
          <kbd>F</kbd>
        </label>
        <div className="calendar-tabs"><button className="active">Scheduled</button><button>Meeting Notes</button></div>
        <section className="calendar-agenda">
          <span>Today</span>
          {todayEvents.length ? todayEvents.map((event) => (
            <article key={event.id} onClick={() => setSelectedEvent(event)}>
              <strong>{event.title}</strong>
              <small>{formatTimeRange(event.startAt, event.endAt)} · {event.roomName}</small>
            </article>
          )) : <p>No events scheduled.</p>}
          <span>Recent</span>
          {recentEvents.length ? recentEvents.map((event) => (
            <article key={`recent-${event.id}`} onClick={() => setSelectedEvent(event)}>
              <strong>{event.title}</strong>
              <small>{formatEventDateTime(event.startAt)} · {formatTimeRange(event.startAt, event.endAt)} · {event.roomName}</small>
            </article>
          )) : <p>No recent meetings in this week.</p>}
        </section>
      </aside>
      <section className="calendar-main">
        <header className="calendar-toolbar">
          <div className="calendar-nav">
            <button aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={20} /></button>
            <button aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={20} /></button>
            <button onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
            <strong>{formatMonthTitle(weekStart)}</strong>
          </div>
          <div className="calendar-actions">
            <span><RotateCw size={16} /> Synced locally</span>
            <select value={roomId} onChange={(event) => setRoomId(event.target.value)} aria-label="Calendar room filter">
              <option value="all">All rooms</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
            <button onClick={() => setFormOpen(true)}><Plus size={18} /> New Meeting</button>
          </div>
        </header>
        <div className="calendar-grid">
          <div className="calendar-days">
            <span />
            {weekDays.map((day) => <strong className={isSameDay(day, today) ? "today" : ""} key={day.toISOString()}>{formatDayHeader(day)}</strong>)}
          </div>
          <div className="calendar-body">
            <div className="calendar-hours">{hours.map((hour) => <span key={hour}>{formatHour(hour)}</span>)}</div>
            <div className="calendar-columns">
              {weekDays.map((day) => (
                <div className="calendar-day-column" key={day.toISOString()}>
                  {hours.map((hour) => <span className="calendar-hour-line" key={hour} />)}
                  {events.filter((event) => isSameDay(new Date(event.startAt), day)).map((event) => <CalendarEventCard event={event} key={event.id} onSelect={setSelectedEvent} />)}
                </div>
              ))}
            </div>
          </div>
        </div>
        {formOpen ? (
          <div className="calendar-modal-backdrop">
            <form
              className="calendar-modal"
              onSubmit={(event) => {
                event.preventDefault();
                createMeeting();
              }}
            >
              <header><h2>New Meeting</h2><button type="button" onClick={() => setFormOpen(false)}>Close</button></header>
              <label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Design review" required /></label>
              <label>Office room<select value={draft.roomId} onChange={(event) => setDraft({ ...draft, roomId: event.target.value })}>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
              <div className="calendar-modal-row">
                <label>Date<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required /></label>
                <label>Starts<input type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} required /></label>
                <label>Ends<input type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} required /></label>
              </div>
              <label>Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Agenda, links, notes" /></label>
              <button type="submit" disabled={!session}><Video size={18} /> Create room meeting</button>
            </form>
          </div>
        ) : null}
        {selectedEvent ? (
          <div className="calendar-modal-backdrop">
            <section className="calendar-modal calendar-detail-modal">
              <header><h2>{selectedEvent.title}</h2><button type="button" onClick={() => setSelectedEvent(null)}>Close</button></header>
              {notice ? <p className="calendar-flash">{notice}</p> : null}
              <dl className="calendar-detail-list">
                <div><dt>Room</dt><dd>{selectedEvent.roomName}</dd></div>
                <div><dt>Time</dt><dd>{formatTimeRange(selectedEvent.startAt, selectedEvent.endAt)}</dd></div>
                <div><dt>Date</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date(selectedEvent.startAt))}</dd></div>
                <div><dt>Created by</dt><dd>{selectedEvent.creatorName}</dd></div>
                <div><dt>Status</dt><dd>{selectedEvent.liveStartedAt ? "Started" : "Not started"}</dd></div>
              </dl>
              {selectedEvent.description ? <p className="calendar-detail-description">{selectedEvent.description}</p> : null}
              <div className="calendar-detail-actions">
                {session?.id === selectedEvent.creatorId && !selectedEvent.liveStartedAt ? <button type="button" onClick={() => startMeeting(selectedEvent)}><Video size={18} /> Start meeting</button> : null}
                <button type="button" onClick={() => joinMeeting(selectedEvent)}>Join meeting</button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function CalendarEventCard({ event, onSelect }: { event: CalendarEvent; onSelect: (event: CalendarEvent) => void }) {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const top = (start.getHours() * 60 + start.getMinutes()) * (72 / 60);
  const height = Math.max(34, ((end.getTime() - start.getTime()) / 60000) * (72 / 60));
  return (
    <button className={event.liveStartedAt ? "calendar-event-card calendar-event-live" : "calendar-event-card"} style={{ top, height }} onClick={() => onSelect(event)}>
      <strong>{event.title}</strong>
      <span>{formatTimeRange(event.startAt, event.endAt)}</span>
      <small>{event.roomName}</small>
    </button>
  );
}

function NotificationsWorkspace({ notifications, onMarkAsRead }: { notifications: AppNotification[]; onMarkAsRead: (notificationId: number) => void }) {
  const upcoming = notifications.filter((notification) => notification.type === "day_before" || notification.type === "hour_before");
  const started = notifications.filter((notification) => notification.type === "started");
  const unread = notifications.filter((notification) => !notification.readAt);

  return (
    <section className="notifications-workspace" aria-label="Notifications">
      <aside className="notifications-sidebar">
        <header>
          <h1>Notifications</h1>
          <p>Calendar alerts generated from real office meetings.</p>
        </header>
        <div className="notification-summary-grid" aria-label="Notification totals">
          <span><strong>{notifications.length}</strong>Total</span>
          <span><strong>{unread.length}</strong>Unread</span>
          <span><strong>{upcoming.length}</strong>Upcoming</span>
          <span><strong>{started.length}</strong>Started</span>
        </div>
        <section className="notification-rules">
          <h2>Delivery rules</h2>
          <p>New meeting</p>
          <p>1 day before</p>
          <p>1 hour before</p>
          <p>When started</p>
        </section>
      </aside>
      <section className="notifications-main">
        <header className="notifications-header">
          <div>
            <span className="notifications-header-icon"><Bell size={22} /></span>
            <span>
              <strong>Meeting notifications</strong>
              <small>Synced from Postgres calendar events</small>
            </span>
          </div>
          <span className="notifications-live-pill"><Clock3 size={15} /> Auto refresh</span>
        </header>
        <div className="notifications-list">
          {notifications.length ? notifications.map((notification) => (
            <article className={`${notification.readAt ? "notification-card notification-read" : "notification-card"} notification-${notification.type}`} key={notification.id}>
              <span className="notification-kind">{notificationTypeLabel(notification.type)}</span>
              <div className="notification-card-body">
                <strong>{notification.title}{notification.readAt ? <small>Read</small> : <small>Unread</small>}</strong>
                <p>{notification.body}</p>
              </div>
              <footer>
                <span><CalendarDays size={15} />{formatNotificationDate(notification.eventStartAt)}</span>
                <span>{notification.roomName}</span>
                {notification.readAt ? <span>Read {formatNotificationDate(notification.readAt)}</span> : null}
                <small>{formatNotificationDate(notification.createdAt)}</small>
              </footer>
              {!notification.readAt ? (
                <button className="notification-read-button" type="button" onClick={() => onMarkAsRead(notification.id)}>Mark as read</button>
              ) : null}
            </article>
          )) : (
            <div className="notifications-empty">
              <Bell size={28} />
              <strong>No notifications yet</strong>
              <p>Create or start a calendar meeting to generate real alerts here.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function ChatWorkspace({
  channels,
  selectedChannel,
  selectedChannelId,
  onSelectChannel,
  messages,
  draft,
  setDraft,
  sendMessage,
  session,
  employees,
}: {
  channels: ChatChannel[];
  selectedChannel: ChatChannel;
  selectedChannelId: string;
  onSelectChannel: (channelId: string) => void;
  messages: ChatMessage[];
  draft: string;
  setDraft: (draft: string) => void;
  sendMessage: () => void;
  session: EmployeeSession | null;
  employees: Person[];
}) {
  return (
    <section className="chat-workspace" aria-label="Chat">
      <aside className="chat-sidebar">
        <header className="chat-sidebar-header">
          <h1>Chat</h1>
          <div className="chat-header-actions">
            <button aria-label="New message"><Edit3 size={17} /></button>
            <button aria-label="More chat options"><CircleEllipsis size={18} /></button>
          </div>
        </header>
        <label className="chat-search">
          <Search size={17} />
          <input placeholder="Search or navigate..." />
          <kbd>F</kbd>
        </label>
        <nav className="chat-quick-links" aria-label="Chat shortcuts">
          <button><MessageCircle size={17} />Threads</button>
          <button><Send size={17} />Drafts</button>
        </nav>
        <section className="chat-channel-list">
          <button className="chat-section-title">Rooms</button>
          {channels.map((channel) => (
            <button className={channel.id === selectedChannelId ? "chat-channel active" : "chat-channel"} key={channel.id} onClick={() => onSelectChannel(channel.id)}>
              {channel.locked ? <Lock size={15} /> : <Hash size={16} />}
              <span>{channel.name}</span>
            </button>
          ))}
        </section>
        <section className="chat-channel-list">
          <button className="chat-section-title">Direct messages</button>
          {employees.length ? employees.map((employee) => (
            <div className="chat-dm" key={employee.id}>
              <span className="chat-avatar">{employee.name[0]}</span>
              <span>{employee.name}</span>
            </div>
          )) : <p className="chat-empty-small">No other employees online.</p>}
        </section>
      </aside>
      <section className="chat-main">
        <header className="chat-room-header">
          <div>
            {selectedChannel.locked ? <Lock size={18} /> : <Hash size={19} />}
            <strong>{selectedChannel.name}</strong>
          </div>
          <button className="chat-meet-button">Meet</button>
        </header>
        <div className="chat-message-list">
          {messages.length ? messages.map((message) => {
            const ownMessage = message.fromId === session?.id;
            return (
            <article className={ownMessage ? "chat-message chat-message-own" : "chat-message"} key={message.id}>
              {!ownMessage ? <span className="chat-avatar">{message.fromName[0]}</span> : null}
              <div className="chat-bubble">
                <p className="chat-meta"><strong>{message.fromName}</strong><time>{formatChatTime(message.createdAt)}</time></p>
                <span className="chat-body">{message.body}</span>
              </div>
            </article>
          );
          }) : (
            <div className="chat-empty">
              <strong>No messages yet</strong>
              <span>Messages here are real and scoped to this office room.</span>
            </div>
          )}
        </div>
        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <button type="button" aria-label="Add attachment"><Plus size={19} /></button>
          <input disabled={!session} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={session ? `Message #${selectedChannel.name}` : "Sign in to send messages"} />
          <button type="button" aria-label="Mention"><AtSign size={19} /></button>
          <button type="submit" aria-label="Send message"><Send size={20} /></button>
        </form>
      </section>
    </section>
  );
}

function formatChatTime(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = addDays(today, -1);
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  if (isSameDay(date, today)) return time;
  if (isSameDay(date, yesterday)) return `Yesterday, ${time}`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const seen = new Set(current.map((message) => message.id));
  return [...current, ...incoming.filter((message) => !seen.has(message.id))];
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatMonthTitle(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

function formatDayHeader(date: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" }).format(date);
}

function formatHour(hour: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2026, 0, 1, hour));
}

function formatTimeRange(startAt: string, endAt: string) {
  const formatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  return `${formatter.format(new Date(startAt))} - ${formatter.format(new Date(endAt))}`;
}

function formatEventDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function notificationTypeLabel(type: AppNotification["type"]) {
  if (type === "created") return "Created";
  if (type === "day_before") return "24 hours";
  if (type === "hour_before") return "1 hour";
  return "Started";
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createInitialCalendarDraft(roomId: string): CalendarDraft {
  const now = new Date();
  now.setMinutes(now.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (now.getMinutes() === 0) now.setHours(now.getHours() + 1);
  const end = new Date(now);
  end.setMinutes(end.getMinutes() + 30);
  return {
    title: "",
    description: "",
    roomId,
    date: dateInputValue(now),
    startTime: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    endTime: `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
  };
}

function LeftRail({
  activeTool,
  notificationCount,
  onSelectTool,
  onShowMap,
}: {
  activeTool: RailTool;
  notificationCount: number;
  onSelectTool: (tool: RailTool) => void;
  onShowMap: () => void;
}) {
  const tools = [
    { id: "gather" as RailTool, label: "Gather", Icon: Network, brand: true },
    { id: "search" as RailTool, label: "Search", Icon: Search },
    { id: "map" as RailTool, label: "Map", Icon: Map },
    { id: "chat" as RailTool, label: "Chat", Icon: MessageCircle },
    { id: "calendar" as RailTool, label: "Calendar", Icon: CalendarDays },
    { id: "notifications" as RailTool, label: "Notifications", Icon: Bell, badge: notificationCount ? String(notificationCount) : "" },
  ];

  return (
    <nav className="left-rail" aria-label="Main tools">
      {tools.map((tool, index) => (
        <button
          className={`${activeTool === tool.id ? "rail-button active" : "rail-button"} ${tool.brand ? "brand" : ""} ${index === 1 || index === 3 || index === 5 ? "rail-break" : ""}`}
          key={tool.label}
          aria-label={tool.label}
          aria-pressed={activeTool === tool.id}
          onClick={() => {
            if (tool.id === "map") {
              onShowMap();
              return;
            }
            onSelectTool(tool.id);
          }}
        >
          <tool.Icon aria-hidden="true" size={tool.brand ? 27 : 25} strokeWidth={tool.brand ? 2.4 : 2.2} />
          {tool.badge ? <span className="rail-badge">{tool.badge}</span> : null}
        </button>
      ))}
      <div className="rail-spacer" />
      <button className="rail-button gift" aria-label="Rewards"><Gift aria-hidden="true" size={24} strokeWidth={2.2} /><span className="rail-dot" /></button>
      <button className="rail-button" aria-label="Settings"><Settings aria-hidden="true" size={24} strokeWidth={2.2} /></button>
    </nav>
  );
}

function RightRail() {
  return <nav className="right-rail" aria-label="Integrations">{["tag", "team", "cube", "mail", "in", "send", "ig", "ai", "play"].map((item) => <button className="integration-button" key={item} aria-label={item}>{item}</button>)}<div className="rail-spacer" /><button className="integration-button large" aria-label="Zoom in">+</button><button className="integration-button large" aria-label="Zoom out">-</button><button className="integration-button active" aria-label="Minimap">map</button></nav>;
}

function PersonRow({ name, status, tone }: { name: string; status: string; tone: string }) {
  return <div className="person-row"><span className={`person-avatar avatar-${tone}`}>{name[0]}</span><span><strong>{name}</strong><small>{status}</small></span></div>;
}
