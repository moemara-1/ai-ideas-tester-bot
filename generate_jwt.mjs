import crypto from 'crypto';
import fs from 'fs';

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

const secret = '4393ce81dfb527ad45c82f7e8c714301a9f32fe2143354a8a55acebe80741fe6';

const header = {
  alg: 'HS256',
  typ: 'JWT'
};

const payload = {
  sub: '1208d96e-899d-497c-81f5-e3c7874b38d5', // CEO agent ID
  company_id: process.env.PAPERCLIP_COMPANY_ID,
  adapter_type: 'codex_local',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24),
  iss: 'paperclip',
  aud: 'paperclip-api'
};

const encodedHeader = base64url(JSON.stringify(header));
const encodedPayload = base64url(JSON.stringify(payload));
const signatureInput = `${encodedHeader}.${encodedPayload}`;

const signature = crypto.createHmac('sha256', secret)
  .update(signatureInput)
  .digest('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=/g, '');

const jwt = `${signatureInput}.${signature}`;
console.log(jwt);
