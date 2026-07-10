import { Router } from "express";
import { db } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();

function expandHours(startHour: unknown, duration: unknown) {
  const start = parseFloat(String(startHour));
  const dur = parseFloat(String(duration));
  if (isNaN(start) || isNaN(dur)) return [];
  const chunks = dur / 0.5;
  const hours: number[] = [];
  for (let i = 0; i < chunks; i++) hours.push(start + i * 0.5);
  return hours;
}

// Customer-facing "Booking ID" -- a random 6-digit code, distinct from the
// internal auto-increment `id` used for every other API call.
function generateBookingCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const date = req.query.date;
    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "date query parameter is required" });
    }

    const result = await db.execute({
      sql: "SELECT start_hour, duration FROM bookings WHERE date = ?",
      args: [date],
    });

    const reservedHours = result.rows.flatMap((row) => expandHours(row.start_hour, row.duration));
    res.json({ reservedHours });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const {
      name,
      phone,
      email,
      guests,
      date,
      time_range,
      duration,
      start_hour,
      occasion,
      notes,
      services,
      payment_status,
      payment_method,
      total_price,
      idempotencyKey,
    } = req.body;

    if (!name || !date || start_hour === undefined || start_hour === null || isNaN(parseFloat(start_hour)) || !duration) {
      return res.status(400).json({ error: "Missing required fields or invalid start hour" });
    }

    // Replay of a submission that already went through (double-click, retry,
    // etc.) -- return the original result instead of re-checking overlap.
    if (idempotencyKey) {
      const dup = await db.execute({
        sql: "SELECT id, booking_code FROM bookings WHERE idempotency_key = ?",
        args: [idempotencyKey],
      });
      if (dup.rows[0]) {
        return res
          .status(201)
          .json({ message: "Booking created successfully", id: Number(dup.rows[0].id), booking_code: dup.rows[0].booking_code });
      }
    }

    const existing = await db.execute({
      sql: "SELECT start_hour, duration FROM bookings WHERE date = ?",
      args: [date],
    });

    const requestedHours = new Set(expandHours(start_hour, duration));
    const isOverlapping = existing.rows.some((row) =>
      expandHours(row.start_hour, row.duration).some((h) => requestedHours.has(h)),
    );

    if (isOverlapping) {
      return res.status(409).json({ error: "Time slot is already reserved." });
    }

    // Collisions on a random 6-digit code are rare but possible -- the
    // unique index catches them, so just try again with a fresh code.
    for (let attempt = 0; attempt < 5; attempt++) {
      const bookingCode = generateBookingCode();
      try {
        const insert = await db.execute({
          sql: `
            INSERT INTO bookings (name, phone, email, guests, date, time_range, duration, start_hour, occasion, notes, services, payment_status, payment_method, total_price, idempotency_key, booking_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            name,
            phone ?? null,
            email ?? null,
            guests ?? null,
            date,
            time_range ?? null,
            duration,
            start_hour,
            occasion ?? null,
            notes ?? null,
            services ?? null,
            payment_status || "pending",
            payment_method ?? null,
            total_price || 0,
            idempotencyKey ?? null,
            bookingCode,
          ],
        });

        return res
          .status(201)
          .json({ message: "Booking created successfully", id: Number(insert.lastInsertRowid), booking_code: bookingCode });
      } catch (err) {
        if (String(err).includes("UNIQUE") && String(err).includes("booking_code")) {
          continue; // code collision -- retry with a new one
        }
        // Two requests with the same key raced past the check above -- the
        // unique index caught it. Look up and return the winner's result.
        if (idempotencyKey && String(err).includes("UNIQUE")) {
          const dup = await db.execute({
            sql: "SELECT id, booking_code FROM bookings WHERE idempotency_key = ?",
            args: [idempotencyKey],
          });
          if (dup.rows[0]) {
            return res.status(201).json({
              message: "Booking created successfully",
              id: Number(dup.rows[0].id),
              booking_code: dup.rows[0].booking_code,
            });
          }
        }
        throw err;
      }
    }

    throw new Error("Could not generate a unique booking code after 5 attempts");
  }),
);

router.post(
  "/lookup",
  asyncHandler(async (req, res) => {
    const { phone, email } = req.body;

    if (!phone || !email) {
      return res.status(400).json({ error: "Phone number and email are required" });
    }

    const result = await db.execute({
      sql: "SELECT * FROM bookings WHERE phone = ? AND email = ? ORDER BY date DESC, start_hour DESC",
      args: [phone, email],
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No booking found matching that phone number and email" });
    }

    res.json(result.rows);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await db.execute({
      sql: "SELECT * FROM bookings WHERE id = ?",
      args: [req.params.id],
    });
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: "Booking not found" });
    }
    res.json(row);
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { payment_status, total_price, occasion, notes, name, phone, email, guests } = req.body;

    const fields: string[] = [];
    const args: (string | number | null)[] = [];

    if (payment_status !== undefined) {
      fields.push("payment_status = ?");
      args.push(payment_status);
    }
    if (total_price !== undefined) {
      fields.push("total_price = ?");
      args.push(total_price);
    }
    if (occasion !== undefined) {
      fields.push("occasion = ?");
      args.push(occasion);
    }
    if (notes !== undefined) {
      fields.push("notes = ?");
      args.push(notes);
    }
    if (name !== undefined) {
      fields.push("name = ?");
      args.push(name);
    }
    if (phone !== undefined) {
      fields.push("phone = ?");
      args.push(phone);
    }
    if (email !== undefined) {
      fields.push("email = ?");
      args.push(email);
    }
    if (guests !== undefined) {
      fields.push("guests = ?");
      args.push(guests);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields provided to update" });
    }

    args.push(req.params.id);
    const result = await db.execute({
      sql: `UPDATE bookings SET ${fields.join(", ")} WHERE id = ?`,
      args,
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }
    res.json({ message: "Booking updated successfully" });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await db.execute({
      sql: "DELETE FROM bookings WHERE id = ?",
      args: [req.params.id],
    });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }
    res.json({ message: "Booking deleted successfully" });
  }),
);

router.patch(
  "/:id/payment",
  asyncHandler(async (req, res) => {
    const { payment_status, payment_method, amount_paid } = req.body;

    if (!payment_status || !payment_method) {
      return res.status(400).json({ error: "Missing payment_status or payment_method" });
    }

    const result = await db.execute({
      sql: "UPDATE bookings SET payment_status = ?, payment_method = ?, amount_paid = ? WHERE id = ?",
      args: [payment_status, payment_method, amount_paid ?? 0, req.params.id],
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }
    res.json({ message: "Payment updated successfully" });
  }),
);

router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const { phone, email } = req.body;
    if (!phone || !email) {
      return res.status(400).json({ error: "Phone number and email are required" });
    }

    const existing = await db.execute({
      sql: "SELECT payment_status, amount_paid FROM bookings WHERE id = ? AND phone = ? AND email = ?",
      args: [req.params.id, phone, email],
    });

    const row = existing.rows[0];
    if (!row) {
      return res.status(404).json({ error: "No booking found matching that phone number and email" });
    }
    if (row.payment_status === "cancelled") {
      return res.status(409).json({ error: "This booking is already cancelled" });
    }

    // Advance payments are forfeited entirely; a full payment refunds
    // everything minus a flat ₹500 cancellation fee. Anything not yet
    // paid has nothing to refund.
    const amountPaid = Number(row.amount_paid) || 0;
    const refundAmount = row.payment_status === "paid" ? Math.max(0, amountPaid - 500) : 0;

    await db.execute({
      sql: "UPDATE bookings SET payment_status = 'cancelled', refund_amount = ?, cancelled_at = CURRENT_TIMESTAMP WHERE id = ?",
      args: [refundAmount, req.params.id],
    });

    res.json({ message: "Booking cancelled", refundAmount });
  }),
);

export default router;
