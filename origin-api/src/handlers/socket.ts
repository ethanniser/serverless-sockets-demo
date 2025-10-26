// WebSocket-over-HTTP handler for chat rooms
// This handles the WebSocket connection via Pushpin's WebSocket-over-HTTP protocol

import { S2 } from "@s2-dev/streamstore";
import {
  setConnectionState,
  getConnectionState,
  deleteConnectionState,
} from "../redis";
import { statelessWebSocketHandler, type WebSocketContext, type WebSocketEvent } from "../utils";

const s2 = new S2({ accessToken: process.env.S2_AUTH_TOKEN! });
const basin = process.env.S2_BASIN!;

// Publish a message to a Pushpin channel via S2
async function publishToChannel(channel: string, message: string) {
  try {
    // Format message in Pushpin's expected format
    // pubsub-service will add the "J" prefix when forwarding to Pushpin
    const pushpinItem = {
      channel,
      formats: {
        "ws-message": {
          content: message,
        },
      },
    };
    
    await s2.records.append({
      s2Basin: basin,
      stream: `v1/${channel}`,
      appendInput: { records: [{ body: JSON.stringify(pushpinItem) }] },
    });
  } catch (error) {
    console.error(`[Socket] Error publishing to channel ${channel}:`, error);
  }
}

export const GET = async (req: Request): Promise<Response> => {
  return statelessWebSocketHandler(req, {
    // Handle connection open - accept all connections
    onOpen: async (context: WebSocketContext) => {
      console.log(`[Socket] Connection opened: ${context.connectionId}`);
      return [{ type: 'accept' }];
    },

    // Handle incoming text messages
    onMessage: async (context: WebSocketContext, message: string) => {
      const events: WebSocketEvent[] = [];

      try {
        const data = JSON.parse(message);

        if (data.type === "join") {
          // Subscribe to room channel
          const room = data.room || "general";
          const username = data.username || "Anonymous";
          
          console.log(`[Socket] ${username} joining room: ${room}`);
          
          // Track this connection in Redis (with 1 hour TTL)
          await setConnectionState(context.connectionId, username, room, 3600);
          
          // Send subscription control message
          events.push({
            type: 'control',
            content: JSON.stringify({
              type: "subscribe",
              channel: `room:${room}`,
            }),
          });

          // Broadcast join message to room
          await publishToChannel(`room:${room}`, JSON.stringify({
            type: "system",
            message: `${username} joined the room`,
          }));

          // Send welcome message to user
          events.push({
            type: 'text',
            content: JSON.stringify({
              type: "system",
              message: `Welcome to #${room}!`,
            }),
          });

        } else if (data.type === "message") {
          // Broadcast message to room
          const room = data.room || "general";
          const username = data.username || "Anonymous";
          const messageText = data.message;

          console.log(`[Socket] ${username} in ${room}: ${messageText}`);

          await publishToChannel(`room:${room}`, JSON.stringify({
            type: "message",
            username,
            message: messageText,
          }));

        } else {
          console.log(`[Socket] Unknown message type:`, data.type);
        }
      } catch (error) {
        console.error(`[Socket] Error parsing message:`, error);
      }

      return events;
    },

    // Handle connection close
    onClose: async (context: WebSocketContext, closeCode?: number) => {
      const events: WebSocketEvent[] = [];

      // Check if this connection was tracked (user had joined a room)
      const connectionInfo = await getConnectionState(context.connectionId);
      if (connectionInfo) {
        const { username, room } = connectionInfo;
        console.log(`[Socket] ${username} leaving room: ${room}`);
        
        // Send unsubscribe control message
        events.push({
          type: 'control',
          content: JSON.stringify({
            type: "unsubscribe",
            channel: `room:${room}`,
          }),
        });
        
        // Broadcast leave message to room
        await publishToChannel(`room:${room}`, JSON.stringify({
          type: "system",
          message: `${username} has left the room`,
        }));
        
        // Remove from tracking
        await deleteConnectionState(context.connectionId);
      }
      
      // Acknowledge the close
      events.push({ type: 'close', closeCode: 1000 });
      return events;
    },

    // Handle ping - default PONG response is fine, but we can override if needed
    // onPing is optional, defaults to sending PONG
  });
};
