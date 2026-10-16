import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SERVER_INFO, SUPPORTED_PROTOCOL_VERSIONS, handleMessage } from "../src/server";
import { TOOLS, callTool, type QrtapConfig } from "../src/tools";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function config(fetchImpl: typeof fetch): QrtapConfig {
  return { apiKey: "qrtap_key_XXXX", apiUrl: "https://api.example.test", fetchImpl };
}

describe("tool → HTTP mapping", () => {
  it("qrtap_create_code maps to POST /api/v1/codes with Bearer auth and snake_case body", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: "c-1", short_url: "https://api.example.test/k3v9" }, 201));

    const result = await callTool(
      "qrtap_create_code",
      { url: "https://example.com/menu", title: "Menu" },
      config(fetchMock),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/api/v1/codes");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer qrtap_key_XXXX",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      target_url: "https://example.com/menu",
      label: "Menu",
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("short_url");
  });

  it("qrtap_change_destination maps to PATCH /api/v1/codes/{id}", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ id: "c-1" }));

    await callTool(
      "qrtap_change_destination",
      { codeId: "3f0e8a52-6f3e-4b7f-9d2a-1c6f6a2e9b10", url: "https://example.com/new" },
      config(fetchMock),
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/api/v1/codes/3f0e8a52-6f3e-4b7f-9d2a-1c6f6a2e9b10");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ target_url: "https://example.com/new" });
  });

  it("qrtap_list_codes forwards filters as query parameters", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ data: [] }));

    await callTool("qrtap_list_codes", { group: "partner", include_stats: true }, config(fetchMock));

    const [url] = fetchMock.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/api/v1/codes");
    expect(parsed.searchParams.get("group")).toBe("partner");
    expect(parsed.searchParams.get("include")).toBe("stats");
    expect(parsed.searchParams.has("external_ref")).toBe(false);
  });

  it("qrtap_code_stats maps to GET /api/v1/codes/{id}/stats with range", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ total: 5, by_day: [], by_device: [] }));

    await callTool(
      "qrtap_code_stats",
      { codeId: "c-1", from: "2026-07-01T00:00:00Z" },
      config(fetchMock),
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/api/v1/codes/c-1/stats");
    expect(parsed.searchParams.get("from")).toBe("2026-07-01T00:00:00Z");
    expect(init?.method).toBe("GET");
  });

  it("qrtap_create_code forwards external_ref, group and design_template_id", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ id: "c-1" }, 201));

    await callTool(
      "qrtap_create_code",
      {
        url: "https://example.com/branch-7",
        external_ref: "BR-007",
        group: "partner",
        design_template_id: "11111111-1111-4111-8111-111111111111",
      },
      config(fetchMock),
    );

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      target_url: "https://example.com/branch-7",
      external_ref: "BR-007",
      group: "partner",
      design_template_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("qrtap_create_code rejects a group outside the canonical set", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = await callTool(
      "qrtap_create_code",
      { url: "https://example.com", group: "warehouse" },
      config(fetchMock),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("group");
  });

  it("qrtap_create_short_link maps to POST /api/v1/codes with only target_url", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ short_url: "https://api.example.test/abcd" }, 201));

    await callTool("qrtap_create_short_link", { url: "https://example.com" }, config(fetchMock));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/api/v1/codes");
    expect(JSON.parse(String(init?.body))).toEqual({ target_url: "https://example.com" });
  });

  it("qrtap_get_code and qrtap_code_history map to their read endpoints", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] }));

    await callTool("qrtap_get_code", { codeId: "c-1" }, config(fetchMock));
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.example.test/api/v1/codes/c-1");

    await callTool("qrtap_code_history", { codeId: "c-1" }, config(fetchMock));
    expect(String(fetchMock.mock.calls[1]![0])).toBe(
      "https://api.example.test/api/v1/codes/c-1/history",
    );
  });

  it("qrtap_group_stats maps to GET /api/v1/groups/{group}/stats", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ group: "partner", codes: 50, total: 1240 }));

    await callTool(
      "qrtap_group_stats",
      { group: "partner", from: "2026-07-01T00:00:00Z" },
      config(fetchMock),
    );

    const parsed = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(parsed.pathname).toBe("/api/v1/groups/partner/stats");
    expect(parsed.searchParams.get("from")).toBe("2026-07-01T00:00:00Z");
    expect(parsed.searchParams.has("to")).toBe(false);
  });

  it("qrtap_list_codes clamps nothing but forwards limit/offset as integers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ data: [] }));

    await callTool("qrtap_list_codes", { limit: 500, offset: 100 }, config(fetchMock));

    const parsed = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(parsed.searchParams.get("limit")).toBe("500");
    expect(parsed.searchParams.get("offset")).toBe("100");
  });

  it("qrtap_list_design_templates maps to GET /api/v1/design-templates", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ data: [] }));
    await callTool("qrtap_list_design_templates", {}, config(fetchMock));
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.example.test/api/v1/design-templates",
    );
  });
});

// ---------------------------------------------------------------------------
// Bulk issuing — the batch path used for stickers, branches and partners.
// ---------------------------------------------------------------------------

describe("bulk tool", () => {
  it("posts a bare array to /api/v1/codes/bulk, renaming url/title to the API vocabulary", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ created: 2, failed: 0, data: [] }, 201));

    await callTool(
      "qrtap_create_codes_bulk",
      {
        items: [
          { url: "https://example.com/p/1", external_ref: "P-001", group: "partner" },
          { url: "https://example.com/p/2", title: "Витрина", external_ref: "P-002" },
        ],
      },
      config(fetchMock),
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/api/v1/codes/bulk");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual([
      { target_url: "https://example.com/p/1", external_ref: "P-001", group: "partner" },
      { target_url: "https://example.com/p/2", label: "Витрина", external_ref: "P-002" },
    ]);
  });

  it("drops unknown keys instead of forwarding them", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ created: 1 }, 201));

    await callTool(
      "qrtap_create_codes_bulk",
      { items: [{ url: "https://example.com", organization_id: "someone-else", state: "archived" }] },
      config(fetchMock),
    );

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual([
      { target_url: "https://example.com" },
    ]);
  });

  it("refuses an empty batch, an oversized batch and an item without a url", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    const empty = await callTool("qrtap_create_codes_bulk", { items: [] }, config(fetchMock));
    const tooMany = await callTool(
      "qrtap_create_codes_bulk",
      { items: Array.from({ length: 501 }, () => ({ url: "https://example.com" })) },
      config(fetchMock),
    );
    const noUrl = await callTool(
      "qrtap_create_codes_bulk",
      { items: [{ external_ref: "P-001" }] },
      config(fetchMock),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(empty.isError).toBe(true);
    expect(tooMany.isError).toBe(true);
    expect(tooMany.content[0]!.text).toContain("500");
    expect(noUrl.isError).toBe(true);
    expect(noUrl.content[0]!.text).toContain("items[0]");
  });

  it("surfaces API errors as isError tool results, not exceptions", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401));

    const result = await callTool("qrtap_list_codes", {}, config(fetchMock));

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("HTTP 401");
    expect(result.content[0]!.text).toContain("unauthorized");
  });

  it("turns a network failure into a readable result instead of throwing", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("fetch failed"));

    const result = await callTool("qrtap_list_codes", {}, config(fetchMock));

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Could not reach the QRTap API");
    expect(result.content[0]!.text).toContain("fetch failed");
  });

  it("bounds every request with an abort signal so a stalled call cannot hang the agent", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ data: [] }));

    await callTool("qrtap_list_codes", {}, config(fetchMock));

    expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects missing required arguments without calling the API", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    const result = await callTool("qrtap_create_code", {}, config(fetchMock));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("url");
  });
});

// ---------------------------------------------------------------------------
// v1 product surface: pages, reviews, bookings, smart rules.
// ---------------------------------------------------------------------------

describe("page tools", () => {
  const content = { name: "Кофейня «Тандем»", phone: "0555 123 456", segment: "otzyvy" };

  it("qrtap_create_page maps to POST /api/v1/pages with a content envelope", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ slug: "cozy-cafe-x1" }, 201));

    await callTool("qrtap_create_page", { content }, config(fetchMock));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/api/v1/pages");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ content });
  });

  it("qrtap_update_page maps to PATCH /api/v1/pages/{slug}", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ version: 4 }));

    await callTool("qrtap_update_page", { slug: "cozy-cafe-x1", content }, config(fetchMock));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/api/v1/pages/cozy-cafe-x1");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ content });
  });

  it("qrtap_list_pages maps to a plain GET /api/v1/pages", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ data: [] }));

    await callTool("qrtap_list_pages", {}, config(fetchMock));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/api/v1/pages");
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
  });

  it("qrtap_get_page reads one page (the read-before-write step)", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ slug: "cozy-cafe-x1", content }));

    await callTool("qrtap_get_page", { slug: "cozy-cafe-x1" }, config(fetchMock));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/api/v1/pages/cozy-cafe-x1");
    expect(init?.method).toBe("GET");
  });

  it("refuses a non-object content without calling the API", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = await callTool("qrtap_create_page", { content: "just a name" }, config(fetchMock));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("content");
  });
});

describe("review tools", () => {
  it("qrtap_list_reviews defaults to the pending queue", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] }));

    await callTool("qrtap_list_reviews", {}, config(fetchMock));
    expect(new URL(String(fetchMock.mock.calls[0]![0])).searchParams.get("status")).toBe("pending");

    await callTool("qrtap_list_reviews", { status: "published" }, config(fetchMock));
    expect(new URL(String(fetchMock.mock.calls[1]![0])).searchParams.get("status")).toBe("published");
  });

  it("qrtap_moderate_review maps to POST /api/v1/reviews/{id}/moderate", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ status: "published" }));

    await callTool(
      "qrtap_moderate_review",
      { reviewId: "55555555-5555-4555-8555-555555555555", action: "publish" },
      config(fetchMock),
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.example.test/api/v1/reviews/55555555-5555-4555-8555-555555555555/moderate",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ action: "publish" });
  });

  it("rejects an unknown status / action locally", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const listed = await callTool("qrtap_list_reviews", { status: "deleted" }, config(fetchMock));
    const moderated = await callTool(
      "qrtap_moderate_review",
      { reviewId: "r-1", action: "delete" },
      config(fetchMock),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listed.isError).toBe(true);
    expect(moderated.isError).toBe(true);
  });
});

describe("booking tools", () => {
  it("qrtap_list_bookings omits the status filter when none is given", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] }));

    await callTool("qrtap_list_bookings", {}, config(fetchMock));
    expect(new URL(String(fetchMock.mock.calls[0]![0])).searchParams.has("status")).toBe(false);

    await callTool("qrtap_list_bookings", { status: "new" }, config(fetchMock));
    expect(new URL(String(fetchMock.mock.calls[1]![0])).searchParams.get("status")).toBe("new");
  });

  it("qrtap_set_booking_status maps to POST /api/v1/bookings/{id}/status", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ status: "confirmed" }));

    await callTool(
      "qrtap_set_booking_status",
      { bookingId: "66666666-6666-4666-8666-666666666666", status: "confirmed" },
      config(fetchMock),
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.example.test/api/v1/bookings/66666666-6666-4666-8666-666666666666/status",
    );
    expect(JSON.parse(String(init?.body))).toEqual({ status: "confirmed" });
  });

  it("refuses to reopen a booking to 'new'", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = await callTool(
      "qrtap_set_booking_status",
      { bookingId: "b-1", status: "new" },
      config(fetchMock),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });
});

describe("smart rules tool", () => {
  const rules = [{ if: { kind: "device", in: ["ios"] }, to: "https://apps.apple.com/app/id1" }];

  it("qrtap_set_smart_rules maps to PUT /api/v1/codes/{id}/smart-rules", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ rules }));

    await callTool(
      "qrtap_set_smart_rules",
      { codeId: "44444444-4444-4444-8444-444444444444", rules },
      config(fetchMock),
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.example.test/api/v1/codes/44444444-4444-4444-8444-444444444444/smart-rules",
    );
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ rules });
  });

  it("qrtap_get_smart_rules reads the current rule set without a body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ rules: [] }));

    await callTool("qrtap_get_smart_rules", { codeId: "c-1" }, config(fetchMock));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/api/v1/codes/c-1/smart-rules");
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
  });

  it("passes an empty array through as 'clear the rules'", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ rules: [] }));
    await callTool("qrtap_set_smart_rules", { codeId: "c-1", rules: [] }, config(fetchMock));
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ rules: [] });
  });

  it("rejects a non-array rules argument locally", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = await callTool(
      "qrtap_set_smart_rules",
      { codeId: "c-1", rules: { version: 1 } },
      config(fetchMock),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("rules");
  });

  it("surfaces a 429 rate-limit answer as an error result the agent can read", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "rate_limited" }, 429));

    const result = await callTool("qrtap_list_pages", {}, config(fetchMock));

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("HTTP 429");
    expect(result.content[0]!.text).toContain("rate_limited");
  });
});

describe("MCP dispatch", () => {
  const noFetch = { apiKey: "qrtap_key_XXXX", apiUrl: "https://api.example.test" };

  it("initialize echoes a supported protocol version and declares tools", async () => {
    const response = await handleMessage(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } },
      },
      noFetch,
    );

    expect(response).not.toBeNull();
    const result = (response as { result: Record<string, unknown> }).result;
    expect(result.protocolVersion).toBe("2025-03-26");
    expect(result.capabilities).toEqual({ tools: {} });
  });

  it("initialize falls back to the newest supported version for unknown requests", async () => {
    const response = await handleMessage(
      { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } },
      noFetch,
    );
    const result = (response as { result: Record<string, unknown> }).result;
    expect(result.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it("tools/list returns every QRTap tool", async () => {
    const response = await handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, noFetch);
    const result = (response as { result: { tools: typeof TOOLS } }).result;
    expect(result.tools.map((tool) => tool.name)).toEqual([
      "qrtap_create_code",
      "qrtap_create_codes_bulk",
      "qrtap_list_codes",
      "qrtap_get_code",
      "qrtap_change_destination",
      "qrtap_code_history",
      "qrtap_code_stats",
      "qrtap_group_stats",
      "qrtap_create_short_link",
      "qrtap_list_design_templates",
      "qrtap_create_page",
      "qrtap_update_page",
      "qrtap_get_page",
      "qrtap_list_pages",
      "qrtap_list_reviews",
      "qrtap_moderate_review",
      "qrtap_list_bookings",
      "qrtap_set_booking_status",
      "qrtap_get_smart_rules",
      "qrtap_set_smart_rules",
    ]);
  });

  it("every tool declares a name, an English description and an object input schema", () => {
    for (const tool of TOOLS) {
      expect(tool.name).toMatch(/^qrtap_[a-z_]+$/);
      expect(tool.description.length).toBeGreaterThan(60);
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  });

  it("every declared tool is actually dispatchable (no tool advertised but unimplemented)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] }));
    for (const tool of TOOLS) {
      // Empty arguments may fail validation — that returns isError, it does not
      // throw. Only an unimplemented tool throws UnknownToolError.
      await expect(callTool(tool.name, {}, config(fetchMock))).resolves.toBeDefined();
    }
  });

  it("every parameter of every tool carries a description the model can read", () => {
    for (const tool of TOOLS) {
      for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
        const described = (schema as { description?: string }).description ?? "";
        expect(described.length, `${tool.name}.${key} needs a description`).toBeGreaterThan(20);
      }
    }
  });

  it("the version reported over MCP matches the published package version", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(SERVER_INFO.version).toBe(pkg.version);
  });

  it("tools/call with an unknown tool returns JSON-RPC invalid params", async () => {
    const response = await handleMessage(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope", arguments: {} } },
      noFetch,
    );
    expect((response as { error: { code: number } }).error.code).toBe(-32602);
  });

  it("ignores notifications and answers unknown requests with method-not-found", async () => {
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, noFetch)).toBeNull();
    const response = await handleMessage({ jsonrpc: "2.0", id: 5, method: "resources/list" }, noFetch);
    expect((response as { error: { code: number } }).error.code).toBe(-32601);
  });
});
