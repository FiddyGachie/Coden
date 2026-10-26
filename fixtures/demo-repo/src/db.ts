/**
 * Shared in-memory "database" for the fixture app.
 * fixture: true — not real persistence, purely for demo scenarios.
 */
import { z } from "zod";

export const orderSchema = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  items: z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })).min(1),
  status: z.enum(["pending", "confirmed", "shipped", "cancelled"]),
  createdAt: z.string().datetime()
});
export type Order = z.infer<typeof orderSchema>;

// Simple in-memory store — reset between test runs.
const store = new Map<string, Order>();

export const db = {
  orders: {
    findAll: (): Order[] => [...store.values()],
    findById: (id: string): Order | undefined => store.get(id),
    insert: (order: Order): Order => { store.set(order.id, order); return order; },
    clear: (): void => { store.clear(); }
  }
};
