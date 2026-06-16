# JSONVault UI Dashboard

The `jsonvault-ui` package contains the official developer dashboard for JSONVault. Built on Next.js, it provides a comprehensive graphical interface to monitor, manage, and explore the data flowing through your database.

For a broader overview of the entire JSONVault architecture, please refer to the [Root Documentation](../README.md).

## Features

- **Data Explorer**: A visual interface to browse, create, edit, and delete databases, collections, and individual JSON documents.
- **Real-Time Testing**: Connect directly to Server-Sent Event (SSE) streams from the dashboard to observe real-time database mutations as they happen.
- **Index and FTS Management**: Configure and deploy database schemas and Full-Text Search settings without writing raw API requests.
- **Webhook Configuration**: Register and monitor external webhooks to trigger asynchronous workflows.
- **Embedded Documentation**: Native, interactive access to all JSONVault integration guides and references, including an automated `llms.txt` export feature for AI assistants.

## Installation & Setup

### Prerequisites
- Node.js (v18 or later).
- The [JSONVault Core Engine](../jsonvault-core/README.md) must be actively running to supply data to the UI.

### Running the Dashboard Locally

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Create a `.env.local` file in the root of `jsonvault-ui` to point the dashboard to your running core engine.
   ```env
   NEXT_PUBLIC_JSONVAULT_API_URL=http://localhost:5766
   ```

3. **Start the Development Server**:
   ```bash
   npm run dev
   ```

4. **Access the Application**:
   Open your preferred web browser and navigate to `http://localhost:3000`.

## Technology Stack
- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS combined with Lucide React iconography.
- **Content Rendering**: `next-mdx-remote` for serving dynamic, Markdown-driven documentation natively within the application.
