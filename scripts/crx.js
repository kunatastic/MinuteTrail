import { readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey, createHash, sign } from 'node:crypto';

const [zipPath, keyPath, outPath] = process.argv.slice(2);
if (!outPath) {
  console.error('usage: node scripts/crx.js <package.zip> <private-key.pem> <out.crx>');
  process.exit(1);
}

const zip = readFileSync(zipPath);
const key = createPrivateKey(readFileSync(keyPath));
const publicKey = createPublicKey(key).export({ type: 'spki', format: 'der' });
const crxId = createHash('sha256').update(publicKey).digest().subarray(0, 16);

const uint32 = value => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes; };
const varint = value => {
  const bytes = [];
  while (value > 127) { bytes.push((value & 127) | 128); value >>>= 7; }
  bytes.push(value);
  return Buffer.from(bytes);
};
const field = (number, bytes) => Buffer.concat([varint((number << 3) | 2), varint(bytes.length), bytes]);

// CRX3: signature covers "CRX3 SignedData\0" + len(SignedData) + SignedData + zip.
const signedData = field(1, crxId);
const signature = sign('sha256', Buffer.concat([Buffer.from('CRX3 SignedData\0'), uint32(signedData.length), signedData, zip]), key);
const header = Buffer.concat([
  field(2, Buffer.concat([field(1, publicKey), field(2, signature)])),
  field(10000, signedData),
]);
writeFileSync(outPath, Buffer.concat([Buffer.from('Cr24'), uint32(3), uint32(header.length), header, zip]));

const extensionId = [...crxId.toString('hex')].map(digit => String.fromCharCode(97 + parseInt(digit, 16))).join('');
console.log(`${outPath} (${zip.length} byte payload, signing key id ${extensionId})`);
