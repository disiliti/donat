
const http = require('http');
const { app } = require('./server');
const { connectToWhatsApp } = require('./whatsapp');

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
server.listen(PORT, () => console.log('API listening on', PORT));

connectToWhatsApp().catch(err => {
  console.error('WhatsApp init error:', err);
});
