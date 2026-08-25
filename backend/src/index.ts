import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { initSockets } from './sockets';
import { startReminderCron } from './cron/reminders';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { uploadDir } from './lib/upload';
import authRouter from './routes/auth';
import tasksRouter from './routes/tasks';
import pushRouter from './routes/push';
import notificationsRouter from './routes/notifications';

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

app.use('/api/auth', authRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/push', pushRouter);
app.use('/api/notifications', notificationsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = http.createServer(app);
initSockets(httpServer);
startReminderCron();

const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
  console.log(`Personal tracker backend listening on port ${PORT}`);
});
