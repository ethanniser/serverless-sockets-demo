// Redis-based persistence and awareness providers for Yjs
//
// Storage format:
// - Key: `yjs:${docName}:updates` - List of raw update bytes
// - Key: `yjs:${docName}:snapshot` - Optional merged snapshot for optimization
// - Key: `yjs:${docName}:awareness:${clientId}` - Awareness state per client (with TTL)

import { Redis } from "ioredis";
import * as Y from "yjs";
import type { PersistenceProvider, AwarenessStore } from "./yjs-ws-handler";

export type RedisProviderOptions = {
  /** Redis connection URL or options */
  redis?: Redis | string;

  /** Key prefix for Yjs documents */
  keyPrefix?: string;

  /**
   * Number of updates before auto-compaction into snapshot
   * Set to 0 to disable auto-compaction
   */
  compactionThreshold?: number;
};

export function createRedisPersistence(
  options: RedisProviderOptions = {}
): PersistenceProvider {
  const {
    redis: redisOption,
    keyPrefix = "yjs",
    compactionThreshold = 100,
  } = options;

  // Create Redis client
  const redis =
    typeof redisOption === "string"
      ? new Redis(redisOption)
      : redisOption ??
        new Redis(process.env.REDIS_URL || "redis://localhost:6379");

  const updatesKey = (docName: string) => `${keyPrefix}:${docName}:updates`;
  const snapshotKey = (docName: string) => `${keyPrefix}:${docName}:snapshot`;

  return {
    async getState(docName: string): Promise<Uint8Array | null> {
      const doc = new Y.Doc();

      try {
        // Load snapshot if exists
        const snapshot = await redis.getBuffer(snapshotKey(docName));
        if (snapshot) {
          Y.applyUpdate(doc, new Uint8Array(snapshot));
        }

        // Load pending updates
        const updates = await redis.lrangeBuffer(updatesKey(docName), 0, -1);
        for (const update of updates) {
          Y.applyUpdate(doc, new Uint8Array(update));
        }

        // Return merged state
        const state = Y.encodeStateAsUpdate(doc);

        // Return null if empty (no state)
        if (doc.store.clients.size === 0) {
          return null;
        }

        return state;
      } finally {
        doc.destroy();
      }
    },

    async storeUpdate(docName: string, update: Uint8Array): Promise<void> {
      // Append update to list
      await redis.rpush(updatesKey(docName), Buffer.from(update));

      // Check if we should compact
      if (compactionThreshold > 0) {
        const count = await redis.llen(updatesKey(docName));
        if (count >= compactionThreshold) {
          await compact(docName);
        }
      }
    },
  };

  // Compact updates into a snapshot
  async function compact(docName: string): Promise<void> {
    const doc = new Y.Doc();

    try {
      // Load existing snapshot
      const snapshot = await redis.getBuffer(snapshotKey(docName));
      if (snapshot) {
        Y.applyUpdate(doc, new Uint8Array(snapshot));
      }

      // Load all updates
      const updates = await redis.lrangeBuffer(updatesKey(docName), 0, -1);
      for (const update of updates) {
        Y.applyUpdate(doc, new Uint8Array(update));
      }

      // Save new snapshot and clear updates (atomic via pipeline)
      const newSnapshot = Y.encodeStateAsUpdate(doc);
      const pipeline = redis.pipeline();
      pipeline.set(snapshotKey(docName), Buffer.from(newSnapshot));
      pipeline.del(updatesKey(docName));
      await pipeline.exec();
    } finally {
      doc.destroy();
    }
  }
}

export type RedisAwarenessOptions = {
  /** Redis connection URL or options */
  redis?: Redis | string;

  /** Key prefix for awareness data */
  keyPrefix?: string;

  /** TTL for awareness entries in seconds (default: 30, matching y-protocols) */
  ttl?: number;
};

/**
 * Creates a Redis-based awareness store
 * Stores awareness per-client with automatic TTL expiry
 */
export function createRedisAwareness(
  options: RedisAwarenessOptions = {}
): AwarenessStore {
  const { redis: redisOption, keyPrefix = "yjs", ttl = 30 } = options;

  const redis =
    typeof redisOption === "string"
      ? new Redis(redisOption)
      : redisOption ??
        new Redis(process.env.REDIS_URL || "redis://localhost:6379");

  const awarenessKey = (docName: string, clientId: number) =>
    `${keyPrefix}:${docName}:awareness:${clientId}`;

  const awarenessPattern = (docName: string) =>
    `${keyPrefix}:${docName}:awareness:*`;

  return {
    async getAll(docName: string): Promise<Uint8Array[]> {
      // Get all awareness keys for this document
      const pattern = awarenessPattern(docName);
      const keys = await redis.keys(pattern);
      if (keys.length === 0) return [];

      // Get all values
      const values = await redis.mgetBuffer(keys);
      const result = values
        .filter((v): v is Buffer => v !== null)
        .map((v) => new Uint8Array(v));
      return result;
    },

    async set(
      docName: string,
      clientId: number,
      update: Uint8Array
    ): Promise<void> {
      const key = awarenessKey(docName, clientId);
      await redis.setex(key, ttl, Buffer.from(update));
    },

    async remove(docName: string, clientId: number): Promise<void> {
      const key = awarenessKey(docName, clientId);
      await redis.del(key);
    },
  };
}
