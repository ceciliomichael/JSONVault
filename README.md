# JSONVault

JSONVault is a high-performance, self-hosted NoSQL JSON document database bundled with a modern developer dashboard. It is designed to simplify application data storage by allowing developers to store, retrieve, and observe data as natural JSON documents without the overhead of rigid SQL schemas.

## Architecture

The JSONVault project adopts a dual-component architecture to separate storage concerns from presentation and management. Please refer to the dedicated documentation for each component to learn more.

1. **[JSONVault Core Engine](./jsonvault-core/README.md)**  
   The core storage engine is built in Go. It provides the REST API, handles data persistence, enforces optimistic concurrency control, and broadcasts real-time Server-Sent Events (SSE). 

2. **[JSONVault UI Dashboard](./jsonvault-ui/README.md)**  
   The developer dashboard is built with Next.js. It connects to the core engine and provides a graphical interface for exploring collections, running Full-Text Search queries, managing schemas, and monitoring webhooks.

## Core Capabilities

- **Schema-less Organization**: JSONVault creates databases and collections dynamically. Simply send your JSON payloads, and the storage structures will automatically adapt.
- **Real-Time Subscriptions**: Built-in Server-Sent Events (SSE) allow clients to subscribe to document changes. Updates are pushed instantly to connected clients without polling.
- **Full-Text Search**: Native, optimized text search capabilities to query across large datasets efficiently.
- **ACID-like Transactions**: Group multiple document creations, updates, or deletions into single atomic transactions to guarantee data integrity.
- **Webhooks**: Configure outbound HTTP requests that trigger automatically when data changes occur within specific collections.
- **Security at Rest**: Optional AES-GCM encryption ensures that underlying data files remain secure.

## Getting Started

To run the complete JSONVault stack locally, you will need to start both the Core Engine and the UI Dashboard.

### Step 1: Start the Core Engine

Navigate to the core directory and start the Go server. For detailed configuration options, see the [Core Engine Documentation](./jsonvault-core/README.md).

```bash
cd jsonvault-core
cp .env.example .env
go run ./cmd/jsonvault
```

### Step 2: Start the UI Dashboard

In a new terminal window, navigate to the UI directory and start the Next.js development server. For further details, see the [UI Dashboard Documentation](./jsonvault-ui/README.md).

```bash
cd jsonvault-ui
npm install
npm run dev
```

Once both are running, open your browser and navigate to `http://localhost:3000` to access the developer dashboard.

## Documentation

For a comprehensive guide on integrating your application with JSONVault's API, please refer to the master [Integration Guide](./docs/integration-guide.md).
