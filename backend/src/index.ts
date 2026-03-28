import path from 'path';
import fs from 'fs';
import { getDb } from './db/database';
import { createApp } from './app';

const PORT = process.env.PORT || 3001;

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = getDb();
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`TODO API server running at http://localhost:${PORT}`);
  console.log(`Swagger docs at http://localhost:${PORT}/api-docs`);
});
