import { getT300033Adapter } from "../compatibility/t3-0.0.33/adapter.js";
import { FRAMEWORK_VERSION } from "../packages/cli/src/version.js";

const checkout = process.argv[2];
if (!checkout) {
  throw new Error("Usage: check-current-t3-adapter <t3-checkout>");
}

const edits = await getT300033Adapter().plan(checkout, FRAMEWORK_VERSION);
console.log(
  JSON.stringify(
    edits.map(({ kind, path }) => ({ kind, path })),
    null,
    2,
  ),
);
