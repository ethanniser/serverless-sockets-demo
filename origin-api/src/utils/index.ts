// Utility for handling WebSocket-over-HTTP protocol
// Abstracts the low-level protocol details into a clean callback interface

export interface WebSocketContext {
  connectionId: string;
  request: Request;
}

export interface WebSocketEvent {
  type: 'text' | 'control' | 'accept' | 'close' | 'pong';
  content?: string;
  closeCode?: number;
}

export interface WebSocketHandlers {
  onOpen?: (context: WebSocketContext) => Promise<WebSocketEvent[]>;
  onMessage?: (context: WebSocketContext, message: string) => Promise<WebSocketEvent[]>;
  onClose?: (context: WebSocketContext, closeCode?: number) => Promise<WebSocketEvent[]>;
  onPing?: (context: WebSocketContext) => Promise<WebSocketEvent[]>;
  onError?: (context: WebSocketContext, error: Error) => Promise<void>;
}

// Parse WebSocket-over-HTTP events from request body
function parseWebSocketEvents(body: string): Array<{ type: string; content?: string }> {
  const events: Array<{ type: string; content?: string }> = [];
  let offset = 0;

  while (offset < body.length) {
    // Find the event type (up to space or \r\n)
    let eventTypeEnd = body.indexOf(" ", offset);
    let lineEnd = body.indexOf("\r\n", offset);

    if (eventTypeEnd === -1 || (lineEnd !== -1 && lineEnd < eventTypeEnd)) {
      // Event without content
      const eventType = body.substring(offset, lineEnd).trim();
      if (eventType) {
        events.push({ type: eventType });
      }
      offset = lineEnd + 2;
      continue;
    }

    const eventType = body.substring(offset, eventTypeEnd);
    offset = eventTypeEnd + 1;

    // Get content length (hex)
    const contentLengthEnd = body.indexOf("\r\n", offset);
    const contentLengthHex = body.substring(offset, contentLengthEnd);
    const contentLength = parseInt(contentLengthHex, 16);
    offset = contentLengthEnd + 2;

    // Get content
    const content = body.substring(offset, offset + contentLength);
    events.push({ type: eventType, content });
    offset = offset + contentLength + 2; // +2 for \r\n
  }

  return events;
}

// Encode WebSocket-over-HTTP events to response body
function encodeWebSocketEvents(events: WebSocketEvent[]): string {
  let response = "";

  for (const event of events) {
    switch (event.type) {
      case 'accept':
        response += "OPEN\r\n";
        break;
      
      case 'text':
        if (event.content) {
          const hexLen = event.content.length.toString(16).toUpperCase();
          response += `TEXT ${hexLen}\r\n${event.content}\r\n`;
        }
        break;
      
      case 'control':
        if (event.content) {
          const controlMsg = `c:${event.content}`;
          const hexLen = controlMsg.length.toString(16).toUpperCase();
          response += `TEXT ${hexLen}\r\n${controlMsg}\r\n`;
        }
        break;
      
      case 'close':
        const code = event.closeCode || 1000;
        const statusCode = Buffer.from([Math.floor(code / 256), code % 256]);
        response += `CLOSE 2\r\n${statusCode.toString()}\r\n`;
        break;
      
      case 'pong':
        response += "PONG\r\n";
        break;
    }
  }

  return response;
}

/**
 * Stateless WebSocket handler for WebSocket-over-HTTP protocol
 * 
 * Abstracts the protocol details and provides clean callbacks for handling:
 * - Connection open
 * - Text messages
 * - Connection close
 * - Ping/Pong
 * 
 * Handlers return arrays of events to send back to the client.
 */
export async function statelessWebSocketHandler(
  req: Request,
  handlers: WebSocketHandlers
): Promise<Response> {
  const connectionId = req.headers.get("Connection-Id") || "unknown";
  const context: WebSocketContext = { connectionId, request: req };

  console.log(`\n[WebSocket-over-HTTP] Request from connection: ${connectionId}`);

  const body = await req.text();
  const events = body ? parseWebSocketEvents(body) : [{ type: "OPEN" }];

  console.log(`  Events:`, events.map(e => e.type).join(", "));

  const responseEvents: WebSocketEvent[] = [];

  try {
    for (const event of events) {
      let handlerEvents: WebSocketEvent[] = [];

      switch (event.type) {
        case "OPEN":
          console.log(`[WebSocket] OPEN event from ${connectionId}`);
          if (handlers.onOpen) {
            handlerEvents = await handlers.onOpen(context);
          } else {
            // Default: accept the connection
            handlerEvents = [{ type: 'accept' }];
          }
          break;

        case "TEXT":
          if (event.content) {
            console.log(`[WebSocket] TEXT from ${connectionId}:`, event.content);
            if (handlers.onMessage) {
              handlerEvents = await handlers.onMessage(context, event.content);
            }
          }
          break;

        case "CLOSE":
          console.log(`[WebSocket] CLOSE from ${connectionId}`);
          
          // Parse close code if present
          let closeCode: number | undefined;
          if (event.content && event.content.length >= 2) {
            closeCode = (event.content.charCodeAt(0) << 8) | event.content.charCodeAt(1);
          }
          
          if (handlers.onClose) {
            handlerEvents = await handlers.onClose(context, closeCode);
          } else {
            // Default: acknowledge the close
            handlerEvents = [{ type: 'close', closeCode: 1000 }];
          }
          break;

        case "PING":
          console.log(`[WebSocket] PING from ${connectionId}`);
          if (handlers.onPing) {
            handlerEvents = await handlers.onPing(context);
          } else {
            // Default: respond with PONG
            handlerEvents = [{ type: 'pong' }];
          }
          break;

        default:
          console.log(`[WebSocket] Unknown event type: ${event.type}`);
      }

      responseEvents.push(...handlerEvents);
    }
  } catch (error) {
    console.error(`[WebSocket] Error processing events:`, error);
    if (handlers.onError) {
      await handlers.onError(context, error as Error);
    }
    // On error, close the connection
    responseEvents.push({ type: 'close', closeCode: 1011 }); // 1011 = internal error
  }

  const responseBody = encodeWebSocketEvents(responseEvents);

  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "application/websocket-events",
      "Sec-WebSocket-Extensions": "grip",
    },
  });
}

