import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAdminCredentials, isLockedOut, MAX_FAILED_LOGINS } from "./password-login";

const admin = { email: "beheer@voorbeeld.nl", password: "een-lang-wachtwoord" };

test("juiste gegevens; e-mail zonder hoofdlettergevoeligheid", () => {
  assert.equal(checkAdminCredentials({ email: " Beheer@Voorbeeld.nl ", password: "een-lang-wachtwoord" }, admin, 12), true);
});

test("onjuist of ontbrekend", () => {
  assert.equal(checkAdminCredentials({ email: "beheer@voorbeeld.nl", password: "fout" }, admin, 12), false);
  assert.equal(checkAdminCredentials({ email: "ander@voorbeeld.nl", password: "een-lang-wachtwoord" }, admin, 12), false);
  assert.equal(checkAdminCredentials({}, admin, 12), false);
});

test("geen login als het ingestelde wachtwoord te kort of leeg is", () => {
  assert.equal(checkAdminCredentials({ email: "a@b.nl", password: "kort" }, { email: "a@b.nl", password: "kort" }, 12), false);
  assert.equal(checkAdminCredentials({ email: "", password: "" }, { email: "", password: "" }, 12), false);
});

test("slot na te veel mislukte pogingen", () => {
  assert.equal(isLockedOut(MAX_FAILED_LOGINS - 1), false);
  assert.equal(isLockedOut(MAX_FAILED_LOGINS), true);
});
