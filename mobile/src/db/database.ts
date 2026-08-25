// The on-device SQLite database that backs the whole app's offline-first data
// layer (see "Offline-first architecture (mobile)" in API_CONTRACT.md). Every
// screen reads from `taskStore`, which in turn reads/writes here — never
// straight from the network — so viewing/creating/editing tasks never
// depends on connectivity.
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
      ownerId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      ownerJson TEXT NOT NULL,
      attachmentsJson TEXT NOT NULL,
      collaboratorsJson TEXT NOT NULL,
      pendingSync INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pending_ops (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      taskId TEXT NOT NULL,
      payload TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_pending_ops_created_at ON pending_ops (createdAt);
    CREATE INDEX IF NOT EXISTS idx_pending_ops_task_id ON pending_ops (taskId);
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
