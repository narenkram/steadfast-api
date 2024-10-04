const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");

const virtualOrders = new NodeCache();
let orderId = 1;

module.exports = () => {
  // ===> Get Virtual Orders and Trades
  router.get("/getOrdersAndTrades", (req, res) => {
    const orders = virtualOrders.mget(virtualOrders.keys());
    res.json({
      orderBook: Object.values(orders),
      tradeBook: Object.values(orders).filter(
        (order) => order.status === "COMPLETE"
      ),
    });
    console.log(`\nVirtual Get Orders and Trades`);
  });

  // ===> Place Virtual Order
  router.post("/placeOrder", (req, res) => {
    const { uid, actid, exch, tsym, qty, prc, prd, trantype, prctyp, ret } =
      req.body;

    const order = {
      norenordno: orderId++,
      uid,
      actid,
      exch,
      tsym,
      qty: parseInt(qty),
      prc: parseFloat(prc),
      prd,
      trantype,
      prctyp,
      ret,
      status: "COMPLETE",
      orderTimestamp: new Date().toISOString(),
    };

    virtualOrders.set(order.norenordno.toString(), order);

    res.json({ status: "success", norenordno: order.norenordno });
    console.log(`\nVirtual Order Placed:`, order);
  });

  // ===> Cancel Virtual Order
  router.post("/cancelOrder", (req, res) => {
    const { norenordno, uid } = req.body;
    const order = virtualOrders.get(norenordno);

    if (order) {
      order.status = "CANCELLED";
      virtualOrders.set(norenordno, order);
      res.json({ status: "success", result: "cancelled" });
      console.log(`\nVirtual Cancel Order:`, { norenordno }, "Order cancelled");
    } else {
      res.status(404).json({ status: "error", message: "Order not found" });
      console.log(`\nVirtual Cancel Order:`, { norenordno }, "Order not found");
    }
  });

  return router;
};
