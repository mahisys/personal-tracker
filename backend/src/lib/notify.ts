import { NotificationType } from './constants';
import { prisma } from './prisma';
import { serializeNotification } from './serializers';
import { emitToUsers } from '../sockets';
import { sendPushToUsers } from './push';

/**
 * Creates an in-app Notification row, emits it live over the user's socket room, and sends
 * an Expo push notification — the three layers described in the reminder/notification pipeline.
 */
export async function notifyUser(
  userId: string,
  type: NotificationType,
  message: string,
  taskId: string | null,
  pushTitle: string
) {
  const notification = await prisma.notification.create({
    data: { userId, type, message, taskId },
  });

  emitToUsers([userId], 'notification:new', { notification: serializeNotification(notification) });
  await sendPushToUsers([userId], pushTitle, message, { taskId, type });

  return notification;
}
