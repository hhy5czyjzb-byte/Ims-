import { test } from "node:test";
import assert from "node:assert/strict";
import { isLocalHost } from "./env";

test("isLocalHost: alleen deze computer", () => {
  for (const h of ["localhost", "localhost:3000", "127.0.0.1:3000", "[::1]:3000", "LOCALHOST"]) assert.equal(isLocalHost(h), true, h);
  for (const h of ["192.168.1.20:3000", "ims.rouwmaat.nl", "localhost.evil.com", "", null]) assert.equal(isLocalHost(h), false, String(h));
});
