import path from 'path';
import fs from 'fs';
import http from 'http';
import { getDb } from './db/database';
import { createApp } from './app';
import { setupSocketServer } from './socket';

const PORT = process.env.PORT || 3001;

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = getDb();
const app = createApp(db);

// Create HTTP server (needed for Socket.io)
const httpServer = http.createServer(app);

// Setup Socket.io
const todoService = (app as any).todoService;
const authService = (app as any).authService;
const io = setupSocketServer(httpServer, authService, todoService);

// Attach io to app for route handlers to access via req.app
(app as any).io = io;

httpServer.listen(PORT, () => {
  console.log(`TODO API server running at http://localhost:${PORT}`);
  console.log(`WebSocket server running on the same port`);
  console.log(`Swagger docs at http://localhost:${PORT}/api-docs`);
});
