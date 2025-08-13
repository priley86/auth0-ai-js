## Auth0 AI + LangGraph - Calling APIs on user's behalf example

This example demonstrates how to integrate **Auth0 AI SDK** with **LangGraph** to call APIs on user's behalf. It showcases the process of obtaining user authorization and calling an external API using the LangGraph framework.

This example has been updated to use a direct `/chat` endpoint instead of the LangGraph API passthrough. The LangGraph agent runs directly within the Next.js application, eliminating the need for a separate LangGraph server.

### Key Features

- **Direct LangGraph Integration**: The LangGraph agent runs within the Next.js API routes
- **Server-Side Token Management**: Uses Next.js refresh tokens automatically without requiring explicit token passing
- **Streaming Responses**: Real-time streaming of AI responses
- **Federated Connection Handling**: Automatic handling of OAuth interrupts for external APIs

### Architecture

The example uses a `/chat` API endpoint that:
1. Authenticates the user using Auth0 session
2. Processes messages through a LangGraph state machine
3. Streams responses back to the client
4. Handles OAuth interrupts for external API access

No external LangGraph server is required - everything runs within the Next.js application.
