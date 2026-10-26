import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMergePatch } from "../dist/merge.js";

test("merge patch deletes keys and merges nested objects", () => {
  assert.deepEqual(
    applyMergePatch({ a: { b: 1, c: 2 }, d: 3 }, { a: { b: null, e: 4 }, d: null }),
    { a: { c: 2, e: 4 } },
  );
});

test("merge patch strips nulls inside objects that replace non-object or missing targets", () => {
  // RFC 7396: Target[Name] = MergePatch(Target[Name], Value), where a non-object
  // target is treated as {} — nulls inside the new object must not be written.
  assert.deepEqual(
    applyMergePatch({ a: "x" }, { a: { b: null, c: 1 }, n: { d: null, e: { f: null } } }),
    { a: { c: 1 }, n: { e: {} } },
  );
});

test("merge patch does not mutate its inputs", () => {
  const target = { a: { b: 1 } };
  const patch = { a: { c: { d: null } } };
  applyMergePatch(target, patch);
  assert.deepEqual(target, { a: { b: 1 } });
  assert.deepEqual(patch, { a: { c: { d: null } } });
});
