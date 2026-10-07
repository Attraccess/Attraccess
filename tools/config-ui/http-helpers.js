'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkAuth(req) {
  const password = process.env.CONFIG_UI_PASSWORD || '';
  if (!password) return false;

  const username = process.env.CONFIG_UI_USERNAME || 'admin';
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Basic ')) return false;

  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const [user, pass] = decoded.split(':');
  return timingSafeEqual(user, username) && timingSafeEqual(pass, password);
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function send401(res) {
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Config UI"',
    'Content-Type': 'text/plain',
  });
  res.end('Unauthorized');
}

const MAX_BODY_SIZE = 64 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

const WEAK_PASSWORDS = new Set([
  'admin',
  'attraccess',
  'change-me',
  'change-me-before-deploying',
  'changeme',
  'password',
  'root',
]);

function isWeakPassword(value) {
  if (typeof value !== 'string' || value.length === 0) return true;
  if (value.length < 12) return true;
  return WEAK_PASSWORDS.has(value.toLowerCase());
}
module.exports = {
  timingSafeEqual,
  checkAuth,
  sendJson,
  send401,
  MAX_BODY_SIZE,
  readBody,
  loadJson,
  saveJson,
  WEAK_PASSWORDS,
  isWeakPassword,
};
