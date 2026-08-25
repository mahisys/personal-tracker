import cron from 'node-cron';
import { NotificationType } from '../lib/constants';
import { prisma } from '../lib/prisma';
import { notifyUser } from '../lib/notify';
import { getTaskParticipantIds } from '../lib/taskAccess';

/**
 * Every 60s: finds tasks whose reminder has come due and hasn't fired yet, marks them
 * notified, and delivers a REMINDER notification (in-app + push + socket) to the owner
 * and every collaborator.
 */
async function processDueReminders() {
  const now = new Date();

  const dueTasks = await prisma.task.findMany({
    where: { reminderAt: { lte: now }, reminderNotified: false },
    include: { collaborators: true },
  });

  for (const task of dueTasks) {
    await prisma.task.update({ where: { id: task.id }, data: { reminderNotified: true } });

    const participantIds = getTaskParticipantIds(task);
    for (const userId of participantIds) {
      await notifyUser(
        userId,
        NotificationType.REMINDER,
        `Reminder: "${task.title}" is due`,
        task.id,
        'Task reminder'
      );
    }
  }
}

export function startReminderCron() {
  cron.schedule('* * * * *', () => {
    processDueReminders().catch((err) => console.error('Reminder cron failed', err));
  });
}
