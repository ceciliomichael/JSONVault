# JSONVault Core Engine

The `jsonvault-core` package is the foundational storage engine for the JSONVault platform. Written in Go, it is designed to be exceptionally lightweight, fast, and secure. The engine exposes a robust REST API for managing NoSQL document data and supports real-time synchronization out of the box.

For a broader overview of the entire JSONVault architecture, please refer to the [Root Documentation](../README.md).

## Capabilities

- **RESTful API**: Intuitive and standard CRUD operations for JSON document management.
- **Server-Sent Events (SSE)**: Native real-time streaming allows clients to subscribe to specific databases or collections and receive instant updates when data changes.
- **Full-Text Search (FTS)**: Built-in indexing and search capabilities for rapid text queries.
- **Atomic Transactions**: Support for multi-document operations to ensure that grouped data modifications succeed or fail together.
- **Event Webhooks**: Automated, asynchronous outbound HTTP calls triggered by data mutations.
- **Low Resource Footprint**: Optimized Go concurrency makes it suitable for budget VPS environments or high-density deployments.
- **Security Architecture**: Enforces scoped JWT access control, prevents Server-Side Request Forgery (SSRF) on webhooks, and supports AES-GCM encryption at rest.

## Installation & Setup

### Prerequisites
- Go 1.21 or later.

### Running the Server Locally

1. **Configure the Environment**:
   Copy the example environment configuration file.
   ```bash
   cp .env.example .env
   ```

2. **Start the Engine**:
   Execute the server entry point.
   ```bash
   go run ./cmd/jsonvault
   ```
   The server will bind to the port specified in your `.env` file (e.g., `:5766`).

3. **Verify with Tests**:
   Ensure the engine's integrity by running the test suite.
   ```bash
   go test ./... -v
   ```

## Next Steps

Once the Core Engine is running, you can manage it visually by starting the [JSONVault UI Dashboard](../jsonvault-ui/README.md). 

For detailed API usage instructions, refer to the [Client Integration Guide](../docs/integration-guide.md).
