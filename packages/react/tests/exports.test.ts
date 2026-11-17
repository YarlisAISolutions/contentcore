import { expect, test } from "bun:test";
import * as core from "@contentcore/core";
import * as react from "../src";

test("every core runtime export is re-exported by @contentcore/react", () => {
  const missing = Object.keys(core).filter((name) => !(name in react));
  expect(missing).toEqual([]);
});
