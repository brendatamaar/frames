import assert from "node:assert/strict";
import { Annotation } from "@frames/protocol/schema";
import * as types from "@frames/protocol/types";
import frames from "@frames/vite-plugin";

assert.equal(frames().apply, "serve");
assert.ok(Annotation);
assert.deepEqual(Object.keys(types), []);
console.log("Node compatibility passed");
