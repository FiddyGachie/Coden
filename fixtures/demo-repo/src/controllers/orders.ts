/**
 * CLEAN controller — uses ordersRepository, never calls the database directly.
 * This file should produce a SHIP verdict from Warden.
 * fixture: true
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ordersRepository } from "../repositories/orders.js";

export const ordersRouter = Router();

const createBody = z.object({
  customerId: z.string().min(1),
  items: z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })).min(1)
});

// GET /orders — list all orders
ordersRouter.get("/", (_req: Request, res: Response) => {
  res.json(ordersRepository.findAll());
});

// GET /orders/:id — get a single order
ordersRouter.get("/:id", (req: Request, res: Response) => {
  const order = ordersRepository.findById(req.params["id"] ?? "");
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(order);
});

// POST /orders — create an order
ordersRouter.post("/", (req: Request, res: Response) => {
  const body = createBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  res.status(201).json(ordersRepository.create(body.data));
});
