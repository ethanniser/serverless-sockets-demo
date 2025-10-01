import { Subscriber, Publisher } from "zeromq";
import { S2 } from "@s2-dev/streamstore";
import { EventStream } from "@s2-dev/streamstore/lib/event-streams.js";

const PUSHPIN_STATS_URI =
  process.env.PUSHPIN_STATS_URI || "tcp://localhost:5560";
const PUSHPIN_PUBLISH_URI =
  process.env.PUSHPIN_PUBLISH_URI || "tcp://localhost:5563";

// Track active subscriptions: topic -> S2 stream subscription
const activeSubscriptions = new Map<string, AbortController>();

// Initialize S2 client
const s2 = new S2({
  accessToken: process.env.S2_AUTH_TOKEN!,
});
const basin = process.env.S2_BASIN!;

// ZMQ subscriber for Pushpin stats
const statsSocket = new Subscriber();
statsSocket.connect(PUSHPIN_STATS_URI);
statsSocket.subscribe(); // Subscribe to all messages

// ZMQ publisher for sending messages back to Pushpin
const publishSocket = new Publisher();
publishSocket.connect(PUSHPIN_PUBLISH_URI);

console.log(`📊 Connected to Pushpin stats at ${PUSHPIN_STATS_URI}`);
console.log(`📤 Connected to Pushpin publish at ${PUSHPIN_PUBLISH_URI}`);

// Subscribe to S2 stream and forward messages to Pushpin
async function subscribeToS2Stream(topic: string) {
  if (activeSubscriptions.has(topic)) {
    console.log(`[S2] Already subscribed to stream: ${topic}`);
    return;
  }

  console.log(`[S2] Subscribing to stream: ${topic}`);

  const abortController = new AbortController();
  activeSubscriptions.set(topic, abortController);

  try {
    // Get the current tail position to start reading from latest
    const tailResponse = await s2.records.checkTail({
      s2Basin: basin,
      stream: `/v1/${topic}`,
    });

    try {
      const readResponse = await s2.records.read(
        {
          s2Basin: basin,
          stream: `/v1/${topic}`,
          seqNum: tailResponse.tail.seqNum,
        },
        {
          signal: abortController.signal,
        }
      );

      if (!(readResponse instanceof EventStream)) {
        throw new Error("Read response is not an event stream");
      }

      // Process the events
      for await (const event of readResponse) {
        if (abortController.signal.aborted) {
          console.log(`[S2] Subscription aborted for: ${topic}`);
          return;
        }

        if (event.event === "batch") {
          const body = event.data.records
            .map((record) => record.body)
            .join("\n");

          if (body) {
            console.log(`[S2→Pushpin] Topic: ${topic}, Message: ${body}`);

            // Send to Pushpin via ZMQ publish
            const pushpinMessage = JSON.stringify({
              items: [
                {
                  channel: topic,
                  formats: {
                    "http-stream": {
                      content: body + "\n",
                    },
                  },
                },
              ],
            });

            await publishSocket.send([topic, pushpinMessage]);
          }
        }
      }

      // Short delay before polling again
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (readError) {
      console.error(`[S2] Error reading stream ${topic}:`, readError);
      // Wait a bit longer on error before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error(`[S2] Error subscribing to stream ${topic}:`, error);
    activeSubscriptions.delete(topic);
  }
}

// Unsubscribe from S2 stream
function unsubscribeFromS2Stream(topic: string) {
  const controller = activeSubscriptions.get(topic);
  if (controller) {
    console.log(`[S2] Unsubscribing from stream: ${topic}`);
    controller.abort();
    activeSubscriptions.delete(topic);
  }
}

// Listen to Pushpin stats
async function listenToStats() {
  console.log("👂 Listening for Pushpin stats events...");

  for await (const [msg] of statsSocket) {
    try {
      if (msg) {
        const statsMessage = JSON.parse(msg.toString());

        // Stats format: { type: "conn", event: "subscribe"|"unsubscribe", channel: "topic" }
        if (statsMessage.type === "conn") {
          const channel = statsMessage.channel;

          if (statsMessage.event === "subscribe") {
            console.log(`[Stats] New subscription: ${channel}`);
            subscribeToS2Stream(channel);
          } else if (statsMessage.event === "unsubscribe") {
            console.log(`[Stats] Unsubscribe: ${channel}`);
            unsubscribeFromS2Stream(channel);
          }
        }
      }
    } catch (error) {
      console.error("[Stats] Error processing message:", error);
    }
  }
}

// Start the service
listenToStats();

console.log("🚀 Pubsub service started");
