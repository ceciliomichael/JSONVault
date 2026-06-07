# JSONVault Core Engine

Welcome to the engine room! `jsonvault-core` is the lightweight, fast, and secure Go-based NoSQL database server powering JSONVault. It exposes a simple REST API and supports real-time subscriptions, making it incredibly easy to store, query, and sync JSON documents.

## Key Features
- **Simple REST API**: Standard CRUD operations using JSON over HTTP.
- **Real-Time Subscriptions**: Built-in Server-Sent Events (SSE) to stream changes to clients automatically.
- **Ultra-Lightweight**: Designed to run efficiently with a minimal CPU and memory footprint (perfect for budget VPS environments).
- **Secure**: Admin key plus scoped JWT access, optional fail-closed AES-GCM encryption at rest, and webhook SSRF protection.

## Getting Started

### Prerequisites
- Go 1.21 or later installed.

### Quick Start
1. **Clone & Setup**:
   Copy the example environment file to `.env`:
   ```bash
   cp .env.example .env
   ```

2. **Run the Server**:
   Start the server locally:
   ```bash
   go run ./cmd/jsonvault
   ```
   By default, it will start listening on the port configured in your `.env` file (e.g. `:5766`).

3. **Run Tests**:
   Ensure everything is working correctly by running the test suite:
   ```bash
   go test ./... -v
   ```

## Where to start?
To integrate JSONVault into your apps or manage your deployment, check out the documentation in the root `docs/` folder:
- **[Client Integration Guide](../docs/integration-guide.md):** Learn how to connect your application, read/write data, and subscribe to real-time events.
- **[Operator Guide](../docs/operator-guide.md):** Learn how to configure settings, manage API keys, and host the database.
