// The on-device SQLite database that backs the whole app's data layer. This
// app is fully local and single-user: there is no server, so this database
// is not a cache in front of anything — it's the only place task and
// notification data lives.
import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'personal-tracker.db';

let db: SQLite.SQLiteDatabase | null = null;

function migrate(database: SQLite.SQLiteDatabase): void {
  database.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      dueDate TEXT NOT NULL,
      reminderAt TEXT,
      reminderNotified INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      ragStatus TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      attachmentsJson TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY NOT NULL,
      taskId TEXT,
      message TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (createdAt);
  `);
}

/** Lazily opens (and migrates) the single shared database connection. */
export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DATABASE_NAME);
    migrate(db);
  }
  return db;
}
