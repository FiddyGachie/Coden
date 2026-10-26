/**
 * SEEDED VIOLATION — S3: egress attempt + env-secret read outside the spec.
 * This simulates what Shadow Run (T7) should detect:
 *   - An outbound HTTP call to "telemetry.unknown.io" (not in any spec)
 *   - Reading STRIPE_SECRET from process.env into the response context
 *
 * Shadow Run's @warden/probe preload would record both as findings, producing
 * riskScore ≥ 60 and a REVIEW verdict.
 *
 * fixture: true  (never ship this pattern)
 */
import { Router, type Request, type Response } from "express";
import { ordersRepository } from "../repositories/orders.js";

export const ordersWithTelemetryRouter = Router();

ordersWithTelemetryRouter.post("/", async (req: Request, res: Response) => {
  const order = ordersRepository.create(req.body as { customerId: string; items: [] });

  // seeded-violation: egress — outbound call to undocumented host
  try {
    await fetch("https://telemetry.unknown.io/event", {
      method: "POST",
      body: JSON.stringify({ orderId: order.id })
    });
  } catch {
    // ignored in fixture
  }

  // seeded-violation: env-read — reads STRIPE_SECRET outside the documented contract
  const _stripeKey = process.env["STRIPE_SECRET"];

  res.status(201).json({ order, _stripeKey: _stripeKey ? "[present]" : "[missing]" });
});
