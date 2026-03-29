import { useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './useAuth';

type EventHandler = (data: any) => void;

export function useSocket() {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io(window.location.origin, {
      auth: { token },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[WS] Connected');
      // Join list view room
      socket.emit('list:join');
    });

    socket.on('disconnect', () => {
      console.log('[WS] Disconnected');
    });

    // Re-register all existing handlers
    for (const [event, handlers] of handlersRef.current.entries()) {
      for (const handler of handlers) {
        socket.on(event, handler);
      }
    }

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const on = useCallback((event: string, handler: EventHandler) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set());
    }
    handlersRef.current.get(event)!.add(handler);

    if (socketRef.current) {
      socketRef.current.on(event, handler);
    }

    // Return cleanup function
    return () => {
      handlersRef.current.get(event)?.delete(handler);
      if (socketRef.current) {
        socketRef.current.off(event, handler);
      }
    };
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  const joinTodo = useCallback((todoId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('todo:join', todoId);
    }
  }, []);

  const leaveTodo = useCallback((todoId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('todo:leave', todoId);
    }
  }, []);

  return { on, emit, joinTodo, leaveTodo, socket: socketRef };
}
