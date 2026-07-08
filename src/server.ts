import express from "express";
import cors from "cors";
import bookingsRouter from "./routes/bookings.js";
import adminRouter from "./routes/admin.js";
import slidesRouter from "./routes/slides.js";
import paymentsRouter from "./routes/payments.js";

const app = express();

// Slide uploads carry a base64 image in the JSON body -- default 100kb limit
// is far too small for a photo.
app.use(express.json({ limit: "10mb" }));

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
  }),
);

app.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/bookings", bookingsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/slides", slidesRouter);
app.use("/api/payments", paymentsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Roomies backend listening on port ${port}`);
});
