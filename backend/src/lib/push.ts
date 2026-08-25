import Expo, { ExpoPushMessage } from 'expo-server-sdk';
import { prisma } from './prisma';

const expo = new Expo();

/** Sends a push notification to every registered Expo push token for the given users. */
export async function sendPushToUsers(userIds: string[], title: string, body: string, data?: Record<string, unknown>) {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return;

  const tokens = await prisma.pushToken.findMany({ where: { userId: { in: uniqueIds } } });
  const messages: ExpoPushMessage[] = tokens
    .filter((t) => Expo.isExpoPushToken(t.token))
    .map((t) => ({ to: t.token, title, body, data, sound: 'default' as const }));

  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error('Failed to send Expo push chunk', err);
    }
  }
}
