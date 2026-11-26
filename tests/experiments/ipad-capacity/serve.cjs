'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {candidateSource} = require('../backup-capacity-source.cjs');

const types = {
  'Index.html': 'text/html',
  'check.js': 'application/javascript',
  'insight_storage_v1.js': 'application/javascript',
  'insight_data_health_v1.js': 'application/javascript',
  'insight_sales_count_v1.js': 'application/javascript',
  'insight_indexeddb_storage_v1.js': 'application/javascript',
  'insight_backup_crypto_v1.js': 'application/javascript',
  'insight_backup_guard_v1.js': 'application/javascript'
};
const contents = new Map();
for (const [file, type] of Object.entries(types)) {
  const source = /insight_backup_(crypto|guard)/.test(file)
    ? candidateSource(file, {plaintextMiB: 25, encryptedMiB: 36})
    : fs.readFileSync(path.resolve(__dirname, file.startsWith('insight_') ? '../../..' : '.', file));
  contents.set('/' + file, {source, type});
}

const port = Number(process.argv[2] || 8075);
http.createServer((request, response) => {
  const pathname = request.url.split('?')[0];
  const item = contents.get(pathname === '/' ? '/Index.html' : pathname);
  if (request.method !== 'GET' || !item) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': item.type + '; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
  }).end(item.source);
}).listen(port, '0.0.0.0', () => console.log('Fictional capacity check on port ' + port));
