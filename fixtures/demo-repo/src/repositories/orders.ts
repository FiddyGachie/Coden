/**
 * OrderRepository — the correct abstraction layer.
 * Controllers must go through this, never touch db.query() directly.
 * fixture: true
 */
import { randomUUID } from "node:crypto";
import { db, type Order } from "./db.js";

export type CreateOrderInput = { customerId: string; items: Order["items"] };

export const ordersRepository = {
  findAll: (): Order[] => db.orders.findAll(),
  findById: (id: string): Order | undefined => db.orders.findById(id),
  create: (input: CreateOrderInput): Order => {
    const order: Order = {
      id: randomUUID(),
      customerId: input.customerId,
      items: input.items,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    return db.orders.insert(order);
  }
};
