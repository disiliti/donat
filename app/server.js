
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());

app.get('/', (req,res)=> res.send('DonutBot API OK'));

app.post('/api/create-payment', (req,res)=>{
  const { order_id, amount } = req.body || {};
  const link = `https://orderkuota.example/pay/${order_id}?amount=${amount}`;
  res.json({ link });
});

app.post('/api/payment-webhook', (req,res)=>{
  // Expect: { order_id, status }
  console.log('Webhook:', req.body);
  res.json({ ok:true });
});

module.exports = { app };
