import { Router } from "express";
import { db } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();

router.get(
  "/bookings",
  asyncHandler(async (_req, res) => {
    const result = await db.execute("SELECT * FROM bookings ORDER BY date DESC, start_hour DESC");
    res.json(result.rows);
  }),
);

export default router;
