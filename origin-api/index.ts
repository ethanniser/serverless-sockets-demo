import { S2 } from "@s2-dev/streamstore";

const s2 = new S2({ accessToken: process.env.S2_AUTH_TOKEN! });

const PORT = process.env.PORT || 3000;
const basin = process.env.S2_BASIN!;

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Handle /subscribe/:topic
    if (path.startsWith("/subscribe/")) {
      const topic = path.slice("/subscribe/".length);

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
    }

    // Handle /publish/:topic
    if (path.startsWith("/publish/") && req.method === "POST") {
      const topic = path.slice("/publish/".length);

      if (!topic) {
        return new Response("Topic required", { status: 400 });
      }

      const body = await req.text();
      console.log(`[PUBLISH] Topic: ${topic}, Message: ${body}`);

      try {
        // Append record to S2 stream (stream name = topic)
        await s2.records.append({
          s2Basin: basin,
          stream: `/v1/${topic}`,
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
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Origin API server running on port ${server.port}`);
