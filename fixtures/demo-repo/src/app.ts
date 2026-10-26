/**
 * Express app entry point for the Acme Orders API fixture.
 * fixture: true
 */
import express from "express";
import { ordersRouter } from "./controllers/orders.js";

const app = express();
app.use(express.json());
app.use("/orders", ordersRouter);

const PORT = process.env["PORT"] ? Number(process.env["PORT"]) : 3000;
app.listen(PORT, () => {
  process.stdout.write(`Acme Orders API (fixture) listening on :${PORT}\n`);
});

export { app };
