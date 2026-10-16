/**
 * QRTap MCP server entrypoint (stdio).
 *
 * Config via environment:
 *   QRTAP_API_KEY — organization API key (required)
 *   QRTAP_API_URL — API base, default https://app.qrtap.kg
 */

// The .js extension is deliberate: tsc does not rewrite import specifiers, so
// the emitted ESM in dist/ must already carry the runtime-correct path.
import { runStdio } from "./server.js";

const apiKey = process.env.QRTAP_API_KEY?.trim();
const apiUrl = process.env.QRTAP_API_URL?.trim() || "https://app.qrtap.kg";

if (!apiKey) {
  console.error(
    "qrtap-mcp: QRTAP_API_KEY is required. Get a key for your workspace at https://app.qrtap.kg/workspace/api and set it in the MCP server env.",
  );
  process.exit(1);
}

console.error(`qrtap-mcp: ready (API ${apiUrl}).`);
runStdio({ apiKey, apiUrl });
