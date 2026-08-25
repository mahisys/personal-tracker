import { Server as HttpServer } from 'http';
import { Server as SocketIoServer, Socket } from 'socket.io';
import { verifyToken } from '../lib/jwt';

let io: SocketIoServer | null = null;

export function initSockets(httpServer: HttpServer): SocketIoServer {
  io = new SocketIoServer(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN || '*' },
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Missing auth token'));
    }
    try {
      const payload = verifyToken(token);
      (socket as Socket & { userId: string }).userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as Socket & { userId: string }).userId;
    socket.join(`user:${userId}`);
  });

  return io;
}

export function getIo(): SocketIoServer | null {
  return io;
}

/** Emits an event to every given user's private room. */
export function emitToUsers(userIds: string[], event: string, payload: unknown) {
  if (!io) return;
  const uniqueIds = Array.from(new Set(userIds));
  for (const userId of uniqueIds) {
    io.to(`user:${userId}`).emit(event, payload);
  }
}
