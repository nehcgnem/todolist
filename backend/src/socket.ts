import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { AuthService } from './services/authService';
import { TodoService } from './services/todoService';
import type { AuthTokenPayload } from './types/todo';

export interface RealtimeEvent {
  type: 'todo:created' | 'todo:updated' | 'todo:deleted' | 'todo:restored' | 'todo:shared' | 'todo:unshared' | 'dependency:changed';
  todoId: string;
  userId: string;
  username: string;
  data?: any;
}

export function setupSocketServer(
  httpServer: HttpServer,
  authService: AuthService,
  todoService: TodoService
): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

  // Authentication middleware for Socket.io
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = authService.verifyToken(token);
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user as AuthTokenPayload;
    console.log(`[WS] User connected: ${user.username} (${user.userId})`);

    // Join user's personal room
    socket.join(`user:${user.userId}`);

    // Join a todo room (for collaborative editing)
    socket.on('todo:join', (todoId: string) => {
      // Verify user has access to this todo
      const todo = todoService.getById(todoId, user.userId);
      if (todo) {
        socket.join(`todo:${todoId}`);
        // Notify others in the room
        socket.to(`todo:${todoId}`).emit('user:joined', {
          userId: user.userId,
          username: user.username,
          todoId,
        });
        console.log(`[WS] ${user.username} joined todo:${todoId}`);
      }
    });

    // Leave a todo room
    socket.on('todo:leave', (todoId: string) => {
      socket.leave(`todo:${todoId}`);
      socket.to(`todo:${todoId}`).emit('user:left', {
        userId: user.userId,
        username: user.username,
        todoId,
      });
    });

    // Join a list view room (for real-time list updates)
    socket.on('list:join', () => {
      socket.join(`list:${user.userId}`);
      console.log(`[WS] ${user.username} joined their list view`);
    });

    socket.on('disconnect', () => {
      console.log(`[WS] User disconnected: ${user.username}`);
    });
  });

  return io;
}

// Helper to broadcast events to relevant users
export function broadcastTodoEvent(
  io: SocketServer,
  event: RealtimeEvent,
  affectedUserIds: string[]
): void {
  // Emit to the specific todo room (anyone viewing this todo)
  io.to(`todo:${event.todoId}`).emit(event.type, event);

  // Also emit to each affected user's personal room (for list view updates)
  for (const userId of affectedUserIds) {
    io.to(`user:${userId}`).emit(event.type, event);
  }
}
