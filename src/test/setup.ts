// Tests use a separate database. Each DB test file should call resetDb() in beforeEach.
process.env.DATABASE_URL ??= "postgres://postgres@localhost:5432/command_center_test";
process.env.AUTH_MODE = "dev";
