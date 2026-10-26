/**
 * Baseline tests for the Acme Orders API fixture.
 * These must pass before and after the seeded violations are applied.
 * fixture: true
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db.js";
import { ordersRepository } from "../repositories/orders.js";

before(() => db.orders.clear());

describe("ordersRepository (clean baseline)", () => {
  it("creates an order and retrieves it by id", () => {
    const order = ordersRepository.create({ customerId: "cust-1", items: [{ sku: "SKU-A", qty: 2 }] });
    assert.equal(order.status, "pending");
    assert.equal(ordersRepository.findById(order.id)?.customerId, "cust-1");
  });

  it("findAll returns all inserted orders", () => {
    ordersRepository.create({ customerId: "cust-2", items: [{ sku: "SKU-B", qty: 1 }] });
    assert.ok(ordersRepository.findAll().length >= 2);
  });

  it("findById returns undefined for unknown id", () => {
    assert.equal(ordersRepository.findById("does-not-exist"), undefined);
  });
});
