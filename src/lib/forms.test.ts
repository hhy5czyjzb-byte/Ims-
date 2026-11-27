import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { optionalDate, optionalText, optionalUrl, parseForm, requiredText } from "./forms";

test("parseForm valideert en zet lege velden om naar null", () => {
  const schema = z.object({ title: requiredText(), note: optionalText, due: optionalDate, ids: z.array(z.string()) });
  const fd = new FormData();
  fd.set("title", "  Test  ");
  fd.set("note", "");
  fd.set("due", "2027-01-31");
  fd.append("ids", "a");
  fd.append("ids", "b");
  const out = parseForm(schema, fd, ["ids"]);
  assert.equal(out.title, "Test");
  assert.equal(out.note, null);
  assert.equal(out.due?.toISOString(), "2027-01-31T00:00:00.000Z");
  assert.deepEqual(out.ids, ["a", "b"]);
});

test("parseForm weigert lege verplichte velden", () => {
  const fd = new FormData();
  fd.set("title", "   ");
  assert.throws(() => parseForm(z.object({ title: requiredText() }), fd), /Verplicht veld/);
});

test("optionalUrl accepteert alleen https", () => {
  const s = z.object({ u: optionalUrl });
  assert.equal(s.parse({ u: "https://rouwmaat.sharepoint.com/x" }).u, "https://rouwmaat.sharepoint.com/x");
  assert.equal(s.parse({ u: "" }).u, null);
  assert.throws(() => s.parse({ u: "javascript:alert(1)" }));
  assert.throws(() => s.parse({ u: "http://example.com" }));
});
