
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const path = require('path');
const fs = require('fs');

const file = path.join(__dirname, 'db.json');
if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ users:{}, orders:[] }, null, 2));

const adapter = new JSONFile(file);
const db = new Low(adapter, { users:{}, orders:[] });

module.exports = { db };
