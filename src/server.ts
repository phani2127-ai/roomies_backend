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

// Comma-separated list. An entry starting with "*." matches any subdomain
// (e.g. "*.vercel.app" covers every preview/branch URL Vercel generates for
// this project, not just the one production alias), so we don't have to
// keep adding one-off origins every time a different deployment URL shows up.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isOriginAllowed(origin: string): boolean {
  return allowedOrigins.some((allowed) => {
    if (allowed === "*") return true;
    if (allowed.startsWith("*.")) return origin.endsWith(allowed.slice(1));
    return origin === allowed;
  });
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
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
