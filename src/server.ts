/**
 * Minimal MCP (Model Context Protocol) server over stdio.
 *
 * Why hand-rolled: the platform ships with zero new runtime dependencies, so
 * instead of @modelcontextprotocol/sdk this implements the small JSON-RPC 2.0
 * subset MCP actually needs for a tools-only server: initialize, ping,
 * tools/list, tools/call, plus notification handling. Transport per the MCP
 * spec's stdio profile: one JSON-RPC message per line on stdin/stdout; logs go
 * to stderr only.
 */

import { createInterface } from "node:readline";
import { TOOLS, UnknownToolError, callTool, type QrtapConfig } from "./tools.js";

export const SERVER_INFO = { name: "qrtap-mcp", version: "1.0.4" };

/** Newest first; when the client asks for an unknown version we answer with our newest. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

/** How long to keep the process alive after stdin closes, for in-flight calls. */
const SHUTDOWN_GRACE_MS = 30_000;

type JsonRpcId = string | number | null;

export type JsonRpcMessage = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string; data?: unknown } };

function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function fail(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * Handle one parsed JSON-RPC message. Returns the response to write, or null
 * when nothing must be sent (notifications, client responses).
 */
export async function handleMessage(
  message: JsonRpcMessage,
  config: QrtapConfig,
): Promise<JsonRpcResponse | null> {
  // Responses from the client (to server-initiated requests) — we send none.
  if (message.method === undefined) return null;

  const isNotification = message.id === undefined;
  const id: JsonRpcId = message.id ?? null;

  switch (message.method) {
    case "initialize": {
      const params = asRecord(message.params);
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : SUPPORTED_PROTOCOL_VERSIONS[0];
      return ok(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          [
            "QRTap manages QR codes, short links and public pages for a business.",
            "The one idea everything rests on: a QRTap code encodes a permanent short_url, and the destination behind it is editable forever. So a printed menu, price list or poster is fixed once and redirected later — never reprinted. Say that plainly when a user asks what QRTap is for.",
            "Typical flows. Changeable print: qrtap_create_code(url) → print short_url/png_url → qrtap_change_destination when the content moves. Business card: qrtap_create_page(content) → take public_url → qrtap_create_code(url=public_url). A batch (branches, tables, partners): qrtap_create_codes_bulk with an external_ref and a shared group per item → qrtap_group_stats to report on the whole batch. Inboxes: qrtap_list_reviews (status pending) and qrtap_list_bookings (status new).",
            "Read before you overwrite. qrtap_update_page and qrtap_set_smart_rules replace their payload wholesale — fetch the current state with qrtap_get_page / qrtap_get_smart_rules and merge, or you will erase fields the user never asked you to touch.",
            "Confirm before acting in public. Retargeting a live code, publishing or hiding a review, and confirming or declining a booking all change what real customers see or expect. Show the user what you are about to do and wait. QRTap does not notify guests about booking decisions — somebody still has to call them.",
            "Limits depend on the workspace plan, and both a per-minute and a per-day budget apply. Free: 60 requests per minute, 100 per day. Paid: 120/min and 5,000/day, or 300/min and 50,000/day. A 429 says which budget ran out (scope=minute means wait seconds, scope=day means wait for UTC midnight) and carries Retry-After plus X-RateLimit-* headers; the tool result surfaces it verbatim, so read it rather than retrying blindly. Batch endpoints need a paid plan: qrtap_create_codes_bulk answers 402 plan_required on a free workspace, and the fallback is a loop of qrtap_create_code. Budget matters — prefer bulk over a loop and qrtap_list_codes(include_stats) over per-code stats calls.",
            "Scan analytics are anonymous and aggregate by design — there are no per-visitor records to fetch, at any plan.",
            "Docs: https://app.qrtap.kg/developers",
          ].join("\n\n"),
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS });
    case "tools/call": {
      const params = asRecord(message.params);
      const name = typeof params.name === "string" ? params.name : "";
      try {
        const result = await callTool(name, params.arguments, config);
        return ok(id, result);
      } catch (error) {
        if (error instanceof UnknownToolError) {
          return fail(id, -32602, `Unknown tool: ${error.toolName}`);
        }
        const text = error instanceof Error ? error.message : String(error);
        return fail(id, -32603, `Internal error: ${text}`);
      }
    }
    default:
      // Unknown notifications (e.g. notifications/initialized, notifications/cancelled)
      // are ignored per spec; unknown requests get "method not found".
      if (isNotification) return null;
      return fail(id, -32601, `Method not found: ${message.method}`);
  }
}

/** Wire the server to stdin/stdout: one JSON-RPC message per line. */
export function runStdio(config: QrtapConfig): void {
  const out = (response: JsonRpcResponse) => {
    process.stdout.write(`${JSON.stringify(response)}\n`);
  };

  const readline = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let queue: Promise<void> = Promise.resolve();

  readline.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed === "") return;

    let message: JsonRpcMessage;
    try {
      message = JSON.parse(trimmed) as JsonRpcMessage;
    } catch {
      out(fail(null, -32700, "Parse error"));
      return;
    }

    // Serialize handling so responses keep request order on the wire.
    queue = queue.then(async () => {
      try {
        const response = await handleMessage(message, config);
        if (response) out(response);
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        if (message.id !== undefined) out(fail(message.id ?? null, -32603, text));
        else console.error(`qrtap-mcp: ${text}`);
      }
    });
  });

  readline.on("close", () => {
    // Do not exit while a tool call is still in flight: a client that closes
    // stdin right after writing a request must still receive its response.
    // The grace cap keeps a stalled request from leaving the process alive.
    const grace = setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS);
    grace.unref();
    void queue.then(() => process.exit(0));
  });
}
