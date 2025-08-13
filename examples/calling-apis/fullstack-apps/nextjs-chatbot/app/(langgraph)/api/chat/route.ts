import { HumanMessage } from "@langchain/core/messages";

import { FederatedConnectionInterrupt } from "@auth0/ai/interrupts";
import { auth0 } from "@/lib/auth0";

import { graph } from "../../lib/agent";

export async function POST(request: Request) {
  try {
    // Get the user session to ensure they're authenticated
    const session = await auth0.getSession();
    
    if (!session?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Invalid messages format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Convert messages to LangChain format
    const langchainMessages = messages.map((msg: any) => {
      if (msg.role === "user") {
        return new HumanMessage(msg.content);
      }
      // Add other message types as needed
      return new HumanMessage(msg.content);
    });

    // Generate a unique thread/config ID
    const threadId = `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const config = {
      configurable: {
        thread_id: threadId,
      },
    };

    // Stream the response using LangGraph
    const stream = await graph.stream(
      { messages: langchainMessages },
      { ...config, streamMode: "updates" }
    );

    // Set up SSE headers
    const headers = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // Create a readable stream
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            console.log("📦 Stream chunk received:", {
              chunkKeys: Object.keys(chunk),
              chunkType: typeof chunk,
              hasInterrupts:
                !!chunk.interrupts ||
                (chunk.interrupts && chunk.interrupts.length > 0),
            });

            // Check for interrupts in __interrupt__ key (LangGraph format)
            if (chunk.__interrupt__ && Array.isArray(chunk.__interrupt__)) {
              console.log("🚨 Found interrupts:", chunk.__interrupt__);

              // Look for Auth0 interrupts
              for (const interrupt of chunk.__interrupt__) {
                if (
                  interrupt.value &&
                  FederatedConnectionInterrupt.isInterrupt(interrupt.value)
                ) {
                  console.log(
                    "🔗 Found FederatedConnectionInterrupt:",
                    interrupt.value
                  );

                  const interruptData = {
                    behavior: "resume",
                    connection: interrupt.value.connection || "google-oauth2",
                    scopes: interrupt.value.scopes || [
                      "https://www.googleapis.com/auth/calendar",
                      "https://www.googleapis.com/auth/calendar.events.readonly",
                    ],
                    requiredScopes: interrupt.value.scopes || [
                      "https://www.googleapis.com/auth/calendar", 
                      "https://www.googleapis.com/auth/calendar.events.readonly",
                    ],
                    code: "FEDERATED_CONNECTION_ERROR",
                    toolCall: { id: "unknown" },
                  };

                  const errorData = `AUTH0_AI_INTERRUPTION:${JSON.stringify(interruptData)}`;
                  controller.enqueue(`data: ${errorData}\n\n`);
                  controller.close();
                  return;
                }
              }
            }

            // Handle different chunk formats based on stream mode
            let lastMessage = null;

            if (chunk.messages) {
              // "values" mode - chunk has messages directly
              lastMessage = chunk.messages[chunk.messages.length - 1];
            } else {
              // "updates" mode - check for callLLM updates
              for (const [nodeName, update] of Object.entries(chunk)) {
                console.log(`📝 Node update: ${nodeName}`, update);
                if (
                  nodeName === "callLLM" &&
                  update &&
                  typeof update === "object" &&
                  "messages" in update
                ) {
                  const updateWithMessages = update as { messages: any[] };
                  lastMessage =
                    updateWithMessages.messages[
                      updateWithMessages.messages.length - 1
                    ];
                }
              }
            }

            if (lastMessage && lastMessage.content) {
              const data = JSON.stringify({
                type: "content",
                content: lastMessage.content,
                role: "assistant",
              });

              controller.enqueue(`data: ${data}\n\n`);
            }
          }

          // Send final message
          controller.enqueue("data: [DONE]\n\n");
          controller.close();
        } catch (error) {
          console.error("❌ Error in LangGraph stream:", error);

          // Default error handling
          const errorData = JSON.stringify({
            type: "error",
            error: "An error occurred processing your request",
          });
          controller.enqueue(`data: ${errorData}\n\n`);
          controller.close();
        }
      },
    });

    return new Response(readable, { headers });
  } catch (error) {
    console.error("❌ Error in chat endpoint:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred processing your request" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
