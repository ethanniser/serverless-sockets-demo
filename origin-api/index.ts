import { S2 } from "@s2-dev/streamstore";

const s2 = new S2({ accessToken: process.env.S2_AUTH_TOKEN! });

const PORT = process.env.PORT || 3000;
const basin = process.env.S2_BASIN!;

const server = Bun.serve({
  port: PORT,
  routes: {
    // WebSocket-over-HTTP endpoint
    "/socket": async (req) => {
      console.log("\n[SOCKET] Received WebSocket-over-HTTP request");
      console.log("Method:", req.method);
      console.log("Headers:", Object.fromEntries(req.headers.entries()));
      
      const body = await req.text();
      console.log("Body length:", body.length);
      if (body) {
        console.log("Body:", body);
        console.log("Body (hex):", Buffer.from(body).toString("hex"));
      } else {
        console.log("Body: (empty)");
      }

      // Parse WebSocket-over-HTTP events from the body
      let responseEvents = "";
      
      if (!body || body.length === 0) {
        // Empty body might mean initial connection
        console.log("📖 Empty body - assuming OPEN, accepting connection");
        responseEvents = "OPEN\r\n";
      } else if (body.includes("OPEN")) {
        console.log("📖 OPEN event received - accepting connection");
        // Respond with OPEN to accept the connection
        responseEvents = "OPEN\r\n";
      } else if (body.includes("TEXT")) {
        // Parse TEXT events
        console.log("📝 TEXT event(s) received");
        // Echo back a response
        const message = "Message received!";
        const hexLen = message.length.toString(16).toUpperCase();
        responseEvents = `TEXT ${hexLen}\r\n${message}\r\n`;
      } else if (body.includes("CLOSE")) {
        console.log("🔒 CLOSE event received");
        // Respond with CLOSE (status code 1000 = normal closure)
        const statusCode = Buffer.from([0x03, 0xE8]); // 1000 in big-endian
        responseEvents = `CLOSE 2\r\n${statusCode.toString()}\r\n`;
      } else if (body.includes("PING")) {
        console.log("🏓 PING received - sending PONG");
        responseEvents = "PONG\r\n";
      }

      console.log("Response events:", responseEvents ? responseEvents.replace(/\r\n/g, "\\r\\n") : "(empty)");

      return new Response(responseEvents, {
        status: 200,
        headers: {
          "Content-Type": "application/websocket-events",
        },
      });
    },

    // Dynamic route for /subscribe/:topic
    "/subscribe/:topic": (req) => {
      const topic = req.params.topic;

      if (!topic) {
        return new Response("Topic required", { status: 400 });
      }

      console.log(`[SUBSCRIBE] Topic: ${topic}`);

      // Return GRIP hold stream response
      // This tells Pushpin to hold the connection and subscribe to the channel
      return new Response("", {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Grip-Hold": "stream",
          "Grip-Channel": topic,
          "Grip-Keep-Alive": "\\n; format=cstring; timeout=20",
        },
      });
    },

    // POST handler for /publish/:topic
    "/publish/:topic": {
      POST: async (req) => {
        const topic = req.params.topic;

        if (!topic) {
          return new Response("Topic required", { status: 400 });
        }

        const body = await req.text();
        console.log(`[PUBLISH] Topic: ${topic}, Message: ${body}`);

        try {
          // Append record to S2 stream (stream name = topic)
          await s2.records.append({
            s2Basin: basin,
            stream: `v1/${topic}`,
            appendInput: { records: [{ body: body }] },
          });

          return new Response(
            JSON.stringify({
              success: true,
              topic,
              message: "Published to S2 stream",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        } catch (error) {
          console.error("[PUBLISH ERROR]", error);
          return new Response(
            JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      },
    },
  },

  // Fallback for unmatched routes
  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Origin API server running on port ${server.port}`);
