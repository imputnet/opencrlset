import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { test } from "node:test";
import { PbfWriter } from "pbf";
import { crxIdFromHash, verifyCrx } from "../src/crx.ts";
import { CRLSET_COMPONENT_ID, CRLSET_PUBLIC_KEY_SHA256 } from "../src/google.ts";
import { sha256 } from "../src/x509.ts";

const message = (fields: [number, Buffer][]) => {
  const writer = new PbfWriter();

  for (const [field, value] of fields) writer.writeBytesField(field, value);
  const bytes = writer.finish();

  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
};

const uint32 = (value: number) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);

  return buffer;
};

// a CRX3 with one RSA proof, built the way Chromium's crx_creator does
function signCrx(archive: Buffer, key: KeyObject): Buffer {
  const spki = createPublicKey(key).export({ type: "spki", format: "der" });
  const signedHeaderData = message([[1, sha256(spki).subarray(0, 16)]]);
  const signed = Buffer.concat([
    Buffer.from("CRX3 SignedData\0", "latin1"),
    uint32(signedHeaderData.length),
    signedHeaderData,
    archive,
  ]);
  const proof = message([
    [1, spki],
    [2, sign("sha256", signed, key)],
  ]);
  const header = message([
    [2, proof],
    [10000, signedHeaderData],
  ]);

  return Buffer.concat([Buffer.from("Cr24"), uint32(3), uint32(header.length), header, archive]);
}

test("derives component IDs like Chromium", () => {
  assert.equal(crxIdFromHash(CRLSET_PUBLIC_KEY_SHA256), CRLSET_COMPONENT_ID);
});

test("verifies CRX3 files like Chromium", () => {
  const { privateKey: key, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keyHash = sha256(publicKey.export({ type: "spki", format: "der" }));
  const archive = Buffer.from("PK\x03\x04 an archive", "latin1");
  const crx = signCrx(archive, key);

  const verified = verifyCrx(crx, [keyHash]);
  assert.equal(verified.id, crxIdFromHash(keyHash));
  assert.deepEqual(verified.archive, archive);

  assert.throws(() => verifyCrx(crx, [Buffer.alloc(32)]), /required key/);
  const tampered = Buffer.from(crx);
  tampered[tampered.length - 3]! ^= 1;
  assert.throws(() => verifyCrx(tampered), /signature/);
  assert.throws(() => verifyCrx(Buffer.from("not a crx")), /not a CRX/);
});
