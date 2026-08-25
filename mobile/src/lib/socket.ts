// Single Socket.IO connection kept alive for the lifetime of an
// authenticated session, per API_CONTRACT.md's Realtime section.
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../api/client';
import { AppNotification, Task } from '../api/types';

// The API contract serves the socket from the same host/port as the REST
// API, whose base URL includes a trailing `/api` — strip that for the
// Socket.IO endpoint.
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

interface SocketHandlers {
  onTaskCreated: (task: Task) => void;
  onTaskUpdated: (task: Task) => void;
  onTaskDeleted: (taskId: string) => void;
  onNotificationNew: (notification: AppNotification) => void;
}

let socket: Socket | null = null;

export function connectSocket(token: string, handlers: SocketHandlers): void {
  disconnectSocket();

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
  });

  socket.on('task:created', ({ task }: { task: Task }) => handlers.onTaskCreated(task));
  socket.on('task:updated', ({ task }: { task: Task }) => handlers.onTaskUpdated(task));
  socket.on('task:deleted', ({ taskId }: { taskId: string }) => handlers.onTaskDeleted(taskId));
  socket.on('notification:new', ({ notification }: { notification: AppNotification }) =>
    handlers.onNotificationNew(notification),
  );
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
