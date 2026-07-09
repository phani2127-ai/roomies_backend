import { Router } from "express";
import { db } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();

// Slide photos are stored as base64 data URIs directly in the DB -- no
// external blob storage to configure. Cap well under the 10mb JSON body
// limit so a single oversized upload can't blow past it.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const result = await db.execute("SELECT * FROM slides ORDER BY id ASC");
    res.json(result.rows);
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: "No image data provided" });
    }

    const matches = image.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: "Invalid base64 image format" });
    }

    const buffer = Buffer.from(matches[2], "base64");
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return res.status(400).json({ error: "Image is too large (max 4MB)" });
    }

    const insert = await db.execute({
      sql: "INSERT INTO slides (url) VALUES (?)",
      args: [image],
    });

    res.status(201).json({ id: Number(insert.lastInsertRowid), url: image });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await db.execute({
      sql: "DELETE FROM slides WHERE id = ?",
      args: [req.params.id],
    });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "Slide not found" });
    }
    res.json({ message: "Slide deleted successfully" });
  }),
);

export default router;
