import * as socketV2Handler from "./handlers/socket-v2";
import * as subscribeV2Handler from "./handlers/subscribe-v2";
import * as publishV2Handler from "./handlers/publish-v2";
import * as cursorsV2Handler from "./handlers/cursors-v2";

const PORT = process.env.PORT || 3000;

// CORS preflight handler
const handleOptions = () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
};

const server = Bun.serve({
  port: PORT,
  routes: {
    // ========================================
    // v2 APIs using @fanoutio/grip abstractions
    // ========================================

    // WebSocket-over-HTTP endpoint for chat (v2)
    "/socket": socketV2Handler.GET,

    // WebSocket-over-HTTP endpoint for cursors (v2)
    "/cursors": cursorsV2Handler.GET,

    // Dynamic route for /v2/subscribe/:topic
    "/subscribe/:topic": {
      GET: subscribeV2Handler.GET,
    },

    // POST handler for /v2/publish/:topic
    "/publish/:topic": {
      POST: publishV2Handler.POST,
    },
  },

  // Fallback for unmatched routes
  fetch(req) {
    // Handle OPTIONS for any route
    if (req.method === "OPTIONS") {
      return handleOptions();
    }
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Origin API server running on port ${server.port}`);
