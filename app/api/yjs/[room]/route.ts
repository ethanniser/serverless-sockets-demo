// Yjs WebSocket-over-HTTP endpoint
// Room name comes from URL path: /api/yjs/:room

import { makeYjsHandler } from "@/app/lib/yjs-ws-handler";
import {
  createRedisPersistence,
  createRedisAwareness,
} from "@/app/lib/yjs-redis-persistence";

const persistence = createRedisPersistence();
const awareness = createRedisAwareness();

const handler = makeYjsHandler({ persistence, awareness });

export const POST = handler;
