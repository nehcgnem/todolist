import express from 'express';
import cors from 'cors';
import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import Database from 'better-sqlite3';
import { TodoService } from './services/todoService';
import { createTodoRouter } from './routes/todos';
import { errorHandler } from './middleware/errorHandler';

export function createApp(db: Database.Database) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Swagger setup — resolve API annotation paths relative to this file's location
  // so that both dev (src/) and production (dist/) builds find the route files.
  const swaggerOptions: swaggerJsdoc.Options = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'TODO List API',
        version: '1.0.0',
        description: 'A TODO list API with recurring tasks, dependencies, filtering, and sorting',
      },
      servers: [{ url: 'http://localhost:3001' }],
    },
    apis: [
      path.join(__dirname, 'routes', '*.ts'),
      path.join(__dirname, 'routes', '*.js'),
    ],
  };

  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  const todoService = new TodoService(db);
  app.use('/api/todos', createTodoRouter(todoService));

  // Serve frontend static files in production
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  // SPA catch-all: serve index.html for non-API routes only
  app.get(/^(?!\/api).*/, (_req, res, next) => {
    res.sendFile(path.join(publicDir, 'index.html'), (err) => {
      if (err) next(); // if index.html doesn't exist (dev mode), skip
    });
  });

  // Error handler
  app.use(errorHandler);

  return app;
}
