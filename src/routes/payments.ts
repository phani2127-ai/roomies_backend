import { Router } from "express";
import Razorpay from "razorpay";
import crypto from "node:crypto";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();

let razorpay: Razorpay | undefined;

function getRazorpay(): Razorpay {
  if (!razorpay) {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_id || !key_secret) {
      throw new Error("Razorpay credentials are not configured");
    }
    razorpay = new Razorpay({ key_id, key_secret });
  }
  return razorpay;
}

router.post(
  "/create-order",
  asyncHandler(async (req, res) => {
    const { amount, currency, receipt } = req.body;

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 100) {
      return res.status(400).json({ error: "amount must be an integer of at least 100 paise" });
    }

    let order;
    try {
      order = await getRazorpay().orders.create({
        amount: Math.round(amount),
        currency: currency || "INR",
        receipt,
      });
    } catch (err: any) {
      const status = err?.statusCode === 401 ? 401 : 500;
      return res.status(status).json({ error: err?.error?.description || "Failed to create Razorpay order" });
    }

    res.json({ order_id: order.id, amount: order.amount, currency: order.currency });
  }),
);

router.post(
  "/verify-payment",
  asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string"
    ) {
      return res.status(400).json({ error: "Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature" });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "Razorpay credentials are not configured" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const isValid =
      expectedSignature.length === razorpay_signature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpay_signature));

    if (!isValid) {
      return res.status(400).json({ verified: false, error: "Signature verification failed" });
    }

    res.json({ verified: true });
  }),
);

export default router;
