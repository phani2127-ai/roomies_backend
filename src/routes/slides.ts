import { Router } from "express";
import { put, del } from "@vercel/blob";
import { db } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();

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

    const ext = matches[1].split("/")[1] || "png";
    const buffer = Buffer.from(matches[2], "base64");
    const filename = `slide-${Date.now()}.${ext}`;

    const blob = await put(filename, buffer, { access: "public" });

    const insert = await db.execute({
      sql: "INSERT INTO slides (url) VALUES (?)",
      args: [blob.url],
    });

    res.status(201).json({ id: Number(insert.lastInsertRowid), url: blob.url });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await db.execute({
      sql: "SELECT url FROM slides WHERE id = ?",
      args: [req.params.id],
    });
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: "Slide not found" });
    }

    try {
      await del(row.url as string);
    } catch (err) {
      console.error("Error deleting blob:", err);
    }

    await db.execute({
      sql: "DELETE FROM slides WHERE id = ?",
      args: [req.params.id],
    });

    res.json({ message: "Slide deleted successfully" });
  }),
);

export default router;
