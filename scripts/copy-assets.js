'use strict';
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
const out = path.join(__dirname, '..', 'dist', 'db', 'schema.sql');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.copyFileSync(src, out);
console.log('schema.sql copiado a dist/db/');