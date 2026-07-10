// One-time table setup for the Turso database. Run manually:
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/init-db.mjs
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    email TEXT,
    guests INTEGER,
    date TEXT,
    time_range TEXT,
    duration INTEGER,
    start_hour INTEGER,
    occasion TEXT,
    notes TEXT,
    services TEXT,
    payment_status TEXT DEFAULT 'pending',
    payment_method TEXT,
    total_price INTEGER,
    amount_paid INTEGER DEFAULT 0,
    refund_amount INTEGER DEFAULT 0,
    cancelled_at DATETIME,
    idempotency_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

await db.execute(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_idempotency_key ON bookings(idempotency_key)"
);

// Additive migration for databases created before booking_code existed --
// ALTER TABLE ADD COLUMN has no "IF NOT EXISTS" in SQLite, so ignore the
// "duplicate column" error on a re-run.
try {
  await db.execute("ALTER TABLE bookings ADD COLUMN booking_code TEXT");
} catch (err) {
  if (!String(err).includes("duplicate column")) throw err;
}

await db.execute(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_booking_code ON bookings(booking_code)"
);

await db.execute(`
  CREATE TABLE IF NOT EXISTS slides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log("Turso tables ready: bookings, slides");
