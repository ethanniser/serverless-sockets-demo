const PUSHPIN_URL = process.env.PUSHPIN_URL || "ws://localhost:7999";

function testWebSocket() {
  console.log("🚀 WebSocket-over-HTTP Test Client");
  console.log(`Connecting to: ${PUSHPIN_URL}/socket\n`);

  // Create WebSocket connection
  const ws = new WebSocket(`${PUSHPIN_URL}/socket`);

  // Connection opened
  ws.addEventListener("open", (event) => {
    console.log("✅ WebSocket connection opened");
    console.log("Event:", event);

    // Send some test messages
    console.log("\n📤 Sending test messages...");

    ws.send("Hello from WebSocket client!");
    console.log("  Sent: 'Hello from WebSocket client!'");

    setTimeout(() => {
      ws.send("This is message #2");
      console.log("  Sent: 'This is message #2'");
    }, 1000);

    setTimeout(() => {
      ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
      console.log("  Sent: JSON ping message");
    }, 2000);

    setTimeout(() => {
      ws.send("Final message before close");
      console.log("  Sent: 'Final message before close'");
    }, 3000);

    // Close connection after 4 seconds
    setTimeout(() => {
      console.log("\n🔌 Closing connection...");
      ws.close(1000, "Test complete");
    }, 4000);
  });

  // Listen for messages
  ws.addEventListener("message", (event) => {
    console.log("\n📨 Received message:");
    console.log("  Data:", event.data);
    console.log("  Type:", typeof event.data);
  });

  // Connection closed
  ws.addEventListener("close", (event) => {
    console.log("\n🔒 WebSocket connection closed");
    console.log("  Code:", event.code);
    console.log("  Reason:", event.reason);
    console.log("  Clean:", event.wasClean);
  });

  // Error handler
  ws.addEventListener("error", (event) => {
    console.error("\n❌ WebSocket error:");
    console.error(event);
  });
}

// Run the test
testWebSocket();

// Keep the process alive for a bit
setTimeout(() => {
  console.log("\n✅ Test complete!");
  process.exit(0);
}, 6000);

