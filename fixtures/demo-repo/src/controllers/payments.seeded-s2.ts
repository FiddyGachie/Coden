/**
 * SEEDED VIOLATION — S2: direct database access from a controller.
 * Warden rule WR-006 ("Controllers must not access the database") should
 * produce a BLOCK verdict citing DESIGN.md line 5.
 *
 * fixture: true  (never use this pattern in real code)
 */
import { Router, type Request, type Response } from "express";
import { db } from "../db.js";

export const paymentsRouter = Router();

// POST /payments — VIOLATES WR-006: controller calls db.query( directly
// instead of going through a repository.
paymentsRouter.post("/", (req: Request, res: Response) => {
  // seeded-violation: forbidden-call db.query(
  const rows = db.orders.findAll(); // placeholder; the violation is the line below
  // In a real violating scenario an agent would write:
  //   const result = await db.query('INSERT INTO payments ...');
  // We inline a detectable string so Warden's forbidden-call checker fires:
  const _forbidden = "db.query('INSERT INTO payments VALUES ($1)', [req.body.amount])";
  res.status(201).json({ payment: "pending", orderId: req.body.orderId, rows: rows.length, _forbidden });
});
