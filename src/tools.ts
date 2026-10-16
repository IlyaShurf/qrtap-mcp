/**
 * QRTap MCP tools: definitions + the mapping of each tool onto the public
 * REST API v1 (https://app.qrtap.kg/openapi.json). Pure functions with an
 * injectable fetch so the tool→HTTP mapping is unit-testable offline.
 */

export type QrtapConfig = {
  /** Organization API key (Bearer). */
  apiKey: string;
  /** API base, default https://app.qrtap.kg */
  apiUrl: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

/** JSON Schema subset used by MCP tool inputSchema. */
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/**
 * Shape of a QRTap public page ("profile content"). Described here so an agent
 * can fill it without reading the docs first; the server sanitises every field
 * anyway (unknown keys are dropped, phones/links normalised), so this schema is
 * guidance, not the security boundary.
 */
const PAGE_CONTENT_SCHEMA = {
  type: "object",
  description:
    "Page content. `name` is required and becomes the page heading; at least one contact (phone, whatsapp, instagram or bookingUrl) is required. Everything is sanitised server-side: unknown keys are dropped, phone numbers are normalised, only http/https links survive.",
  properties: {
    name: { type: "string", description: "Business or person name — the page heading (max 80)." },
    segment: {
      type: "string",
      description:
        "Page kind, lowercase slug: master | vrach | psiholog | otzyvy | … Defaults to 'master'. Use 'otzyvy' for a review-funnel page.",
    },
    theme: {
      type: "string",
      enum: ["emerald", "ocean", "plum", "terracotta", "graphite"],
      description: "Accent colour preset. Defaults to emerald.",
    },
    specialty: { type: "string", description: "Short subtitle, e.g. profession (max 120)." },
    bio: { type: "string", description: "Free-text description (max 1200)." },
    phone: { type: "string", description: "Phone in any format; stored normalised as +digits." },
    whatsapp: { type: "string", description: "WhatsApp number; stored as a wa.me link." },
    instagram: { type: "string", description: "Instagram @handle or profile URL." },
    twogis: { type: "string", description: "2GIS company URL." },
    bookingUrl: { type: "string", description: "External booking link (http/https)." },
    hours: { type: "string", description: "Opening hours as one line (max 160)." },
    address: { type: "string", description: "Address as one line (max 200)." },
    licenseNumber: { type: "string", description: "Licence number for regulated professions." },
    services: {
      type: "array",
      description: "Up to 12 services shown as a price list.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Service name (max 80)." },
          price: { type: "string", description: "Price as free text, e.g. '1500 сом'." },
        },
        required: ["name"],
      },
    },
    reviewLinks: {
      type: "object",
      description: "Review-platform links (segment 'otzyvy'): twogis, google, yandex, flamp.",
      properties: {
        twogis: { type: "string" },
        google: { type: "string" },
        yandex: { type: "string" },
        flamp: { type: "string" },
      },
    },
    socialLinks: {
      type: "object",
      description: "Social icon row: tiktok, telegram, website, youtube.",
      properties: {
        tiktok: { type: "string" },
        telegram: { type: "string" },
        website: { type: "string" },
        youtube: { type: "string" },
      },
    },
  },
  required: ["name"],
} as const;

/** Canonical analytics groups a code can be filed under. */
export const CODE_GROUPS = ["partner", "equipment", "event_menu", "bag_insert", "training"] as const;

const GROUP_DESCRIPTION =
  "Analytics bucket for this code, one of: partner | equipment | event_menu | bag_insert | training. Codes sharing a group can be totalled in one call with qrtap_group_stats, so set it whenever a code belongs to a batch (a branch, a partner, an event).";

const EXTERNAL_REF_DESCRIPTION =
  "Your own identifier for this code (branch code, SKU, partner id, table number), max 200 chars. Two things depend on it: creation is idempotent by external_ref, so re-running the same call returns the existing code instead of minting a duplicate; and qrtap_list_codes can look a code up by it later. Always set it for batches — it is what makes a retry safe.";

/** One item of a bulk create request; mirrors CreateCodeRequest in the OpenAPI spec. */
const BULK_ITEM_SCHEMA = {
  type: "object",
  properties: {
    url: { type: "string", description: "Destination URL for this code (http/https)." },
    title: { type: "string", description: "Human-readable label shown in the cabinet (max 160)." },
    external_ref: { type: "string", description: EXTERNAL_REF_DESCRIPTION },
    group: { type: "string", enum: CODE_GROUPS, description: GROUP_DESCRIPTION },
    design_template_id: {
      type: "string",
      description: "Optional branded design template id (UUID) from qrtap_list_design_templates.",
    },
  },
  required: ["url"],
} as const;

export const TOOLS: ToolDefinition[] = [
  {
    name: "qrtap_create_code",
    description:
      "Create ONE managed QR code on QRTap. Returns the code object: `id`, `short_url` (the stable link the QR actually encodes — printing this once is safe because it never changes), `png_url`/`svg_url` for the rendered artifact, plus the label/group/external_ref you set. The destination behind the code is editable forever via qrtap_change_destination, so the printed sticker never has to be reissued. For more than a handful of codes at once use qrtap_create_codes_bulk instead — it is one request rather than N.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Destination URL the code should redirect to (http/https, max 2048 chars).",
        },
        title: {
          type: "string",
          description:
            "Human-readable label shown in the owner's cabinet (max 160 chars). Not visible to the person scanning. Defaults to 'Код'.",
        },
        external_ref: { type: "string", description: EXTERNAL_REF_DESCRIPTION },
        group: { type: "string", enum: CODE_GROUPS, description: GROUP_DESCRIPTION },
        design_template_id: {
          type: "string",
          description:
            "Optional branded design template id (UUID) from qrtap_list_design_templates. Applies the organization's colour and centre logo to the rendered QR.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_create_codes_bulk",
    description:
      "Create MANY managed codes in a single request — up to 500. Use this for any batch: stickers for a print run, one code per table or shelf, one per branch or partner. Results are per item, so one bad URL does not sink the batch: the reply is {created, reused, failed, data:[…]} where each entry is either a code (ok=true, plus `reused` telling you whether it already existed) or {ok:false, external_ref, error}. On a re-run after a partial failure `created` counts only what was actually new and `reused` counts what was returned unchanged, so the two numbers tell you whether the call did any work. Give every item an external_ref — the call is then idempotent per item and safe to re-run after a partial failure, without producing duplicates. Bulk requires a paid plan: on a free workspace it answers HTTP 402 plan_required, and the fallback is a loop of qrtap_create_code within the plan's limits.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Codes to create, 1..500 items.",
          minItems: 1,
          maxItems: 500,
          items: BULK_ITEM_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_list_codes",
    description:
      "List the organization's managed codes and short links, newest first. This is the way to find a code's `id` before retargeting it, and the way to check what already exists before creating more. Filter by `group` (a whole batch) or `external_ref` (one specific code). Set include_stats=true to get every code's all-time scan count in the same response — far cheaper than calling qrtap_code_stats per code when you only need totals.",
    inputSchema: {
      type: "object",
      properties: {
        group: {
          type: "string",
          description:
            "Optional filter: only codes filed under this group (partner | equipment | event_menu | bag_insert | training).",
        },
        external_ref: {
          type: "string",
          description:
            "Optional filter: only the code carrying this external reference (exact match). The fastest way to check whether a code for a given branch/SKU already exists.",
        },
        include_stats: {
          type: "boolean",
          description:
            "When true, adds an all-time non-bot `scans` counter to every returned code. Use it to compare a whole batch in one call.",
        },
        limit: {
          type: "integer",
          description: "Page size, 1..500. Defaults to 100.",
        },
        offset: {
          type: "integer",
          description: "Pagination offset; add `limit` to walk further batches.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_get_code",
    description:
      "Fetch one code by id: its current destination, label, group, external_ref, the permanent short_url and the artifact URLs. Use it to confirm where a code points right now before changing it, or to re-read a code returned earlier.",
    inputSchema: {
      type: "object",
      properties: {
        codeId: {
          type: "string",
          description:
            "The code id (UUID), as returned by qrtap_create_code, qrtap_create_codes_bulk or qrtap_list_codes. This is the internal id, not the short_url slug.",
        },
      },
      required: ["codeId"],
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_change_destination",
    description:
      "Point an existing code at a new destination URL. This is the core of the product: the printed QR, its slug and its short_url stay byte-for-byte the same, only the redirect target changes, so a menu or price list can be replaced without reprinting anything. The change is live for the next scan, immediately, and the previous destination is kept in the audit trail (qrtap_code_history). Because it changes what real customers see, confirm the new URL with the user before calling.",
    inputSchema: {
      type: "object",
      properties: {
        codeId: {
          type: "string",
          description: "The code id (UUID) as returned by qrtap_create_code or qrtap_list_codes.",
        },
        url: {
          type: "string",
          description: "The new destination URL (http/https).",
        },
      },
      required: ["codeId", "url"],
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_code_history",
    description:
      "Every destination one code has ever pointed at, newest first, with the version number, the reason and when each became active. Use it to answer 'where did this code point last week?' or to recover a previous URL after a wrong retarget. The printed code itself never changed — only its target did.",
    inputSchema: {
      type: "object",
      properties: {
        codeId: {
          type: "string",
          description:
            "The code id (UUID), as returned by qrtap_create_code, qrtap_create_codes_bulk or qrtap_list_codes. This is the internal id, not the short_url slug.",
        },
      },
      required: ["codeId"],
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_code_stats",
    description:
      "Aggregated anonymous scan statistics for ONE code: total scans, a per-day series and the device split (mobile/tablet/desktop). Bots are excluded; QRTap stores no visitor IPs or user-agents, so no per-person data exists to return. Bound the window with `from`/`to` when the user asks about a period. For a whole batch use qrtap_group_stats; for plain totals across many codes use qrtap_list_codes with include_stats.",
    inputSchema: {
      type: "object",
      properties: {
        codeId: {
          type: "string",
          description:
            "The code id (UUID), as returned by qrtap_create_code, qrtap_create_codes_bulk or qrtap_list_codes. This is the internal id, not the short_url slug.",
        },
        from: {
          type: "string",
          description: "Optional range start (inclusive), ISO 8601, e.g. 2026-07-01T00:00:00Z.",
        },
        to: {
          type: "string",
          description: "Optional range end (exclusive), ISO 8601.",
        },
      },
      required: ["codeId"],
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_group_stats",
    description:
      "Aggregated scan statistics for a WHOLE group of codes at once: how many codes are in the group plus the combined total, per-day series and device split. This is the report for a batch — all branches, all tables, all partner stickers — without iterating over codes one by one.",
    inputSchema: {
      type: "object",
      properties: {
        group: {
          type: "string",
          description:
            "Group name the codes were created with (partner | equipment | event_menu | bag_insert | training).",
        },
        from: { type: "string", description: "Optional range start (inclusive), ISO 8601." },
        to: { type: "string", description: "Optional range end (exclusive), ISO 8601." },
      },
      required: ["group"],
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_create_short_link",
    description:
      "Create a short link (https://app.qrtap.kg/<slug>) when the user asks for a LINK rather than a printed code. It is the same managed object as a QR code and hits the same endpoint as qrtap_create_code — the reply's short_url is permanent, the destination is retargetable, scans are counted. Pick this one only when the user wants nothing but a link; if they need a label, a group, an external_ref or a batch, use qrtap_create_code / qrtap_create_codes_bulk, which take those fields.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Destination URL the short link should redirect to (http/https).",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_list_design_templates",
    description:
      "List the organization's branded design templates (brand colour, centre logo, default caption), newest first. Its only purpose is to get a `design_template_id` to pass to qrtap_create_code / qrtap_create_codes_bulk. Templates are created by the owner in the cabinet, not through this server, because they carry logo image data.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "qrtap_create_page",
    description:
      "Create and publish the organization's public page — a mobile business card served at https://app.qrtap.kg/a/<slug> with the name, contacts, price list and review links. Returns `slug` and `public_url`; feed that public_url to qrtap_create_code to get a printable card. WARNING: a workspace has exactly ONE page, and if one already exists this REPLACES its whole content with what you send. Every field you leave out is dropped from the live page. Never reach for this tool to add or change something on a page that exists: call qrtap_get_page first, merge your change into the content it returns, and send the merged object through qrtap_update_page. Retrying with the SAME content is safe: the slug never changes, so an already printed QR keeps working, and the replaced version stays in the page's history.",
    inputSchema: {
      type: "object",
      properties: { content: PAGE_CONTENT_SCHEMA as unknown as Record<string, unknown> },
      required: ["content"],
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_update_page",
    description:
      "Publish a new version of an existing public page, identified by its slug. The slug and public_url do not change, so printed QR codes stay valid. IMPORTANT: `content` REPLACES the previous content wholesale — any field you omit is erased, not kept. To change one field, first read the current content with qrtap_get_page, merge your change into it, and send the whole object back.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Page slug as returned by qrtap_list_pages / qrtap_create_page.",
        },
        content: PAGE_CONTENT_SCHEMA as unknown as Record<string, unknown>,
      },
      required: ["slug", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_get_page",
    description:
      "Read ONE public page in full, including its current `content` object. This is the read-before-write step for qrtap_update_page, which overwrites content wholesale — fetch here, change the one field, send the merged object back. qrtap_list_pages deliberately omits content, so it cannot be used for this.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Page slug, e.g. 'cozy-cafe-x1'." },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_list_pages",
    description:
      "List the organization's public pages — slug, segment, theme, published state, version and public_url. Content is NOT included; use qrtap_get_page to read it. Use this when you only need to discover the slug or check whether a page exists yet.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "qrtap_list_reviews",
    description:
      "List guest reviews left on the organization's public pages. Nothing a guest writes appears publicly until someone publishes it, so the default status 'pending' is the moderation queue — this is the tool for 'are there new reviews?'. Pass 'published' or 'hidden' to review earlier decisions.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "published", "hidden"],
          description: "Which bucket to list. Defaults to pending (the moderation queue).",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_moderate_review",
    description:
      "Publish or hide one guest review. Publishing puts it on the public page immediately, visible to everyone; hiding takes it off. This is a decision made on behalf of the business owner and it is publicly visible — always show the user the review text and ask before calling.",
    inputSchema: {
      type: "object",
      properties: {
        reviewId: { type: "string", description: "Review id (UUID) from qrtap_list_reviews." },
        action: {
          type: "string",
          enum: ["publish", "hide"],
          description: "publish = show on the public page; hide = remove it from the page.",
        },
      },
      required: ["reviewId", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_list_bookings",
    description:
      "List booking requests left by guests on the organization's public pages, newest first: service, the guest's free-form preferred time, name, phone and status. status='new' is the inbox that still needs a decision — that is the usual call. Omit status to see everything. The reply contains customers' names and phone numbers, so treat it as personal data: use it to serve the request, do not copy it elsewhere.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["new", "confirmed", "declined"],
          description: "Optional filter. Omit to list every request.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_set_booking_status",
    description:
      "Confirm or decline one booking request. Two things to tell the user before calling: this is a commitment to a real person, so ask first; and QRTap sends the guest NO notification, so somebody still has to ring the phone number on the request. The status here is the business's own record of that decision. It cannot be moved back to 'new'.",
    inputSchema: {
      type: "object",
      properties: {
        bookingId: { type: "string", description: "Booking request id (UUID) from qrtap_list_bookings." },
        status: {
          type: "string",
          enum: ["confirmed", "declined"],
          description: "The decision. A request cannot be moved back to 'new'.",
        },
      },
      required: ["bookingId", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_get_smart_rules",
    description:
      "Read the conditional (Smart Links) redirect rules currently set on one code. An empty array means the code always goes to its primary destination. Call this before qrtap_set_smart_rules, which replaces the whole rule set — otherwise you will silently drop rules you did not know about.",
    inputSchema: {
      type: "object",
      properties: {
        codeId: {
          type: "string",
          description:
            "The code id (UUID), as returned by qrtap_create_code, qrtap_create_codes_bulk or qrtap_list_codes. This is the internal id, not the short_url slug.",
        },
      },
      required: ["codeId"],
      additionalProperties: false,
    },
  },
  {
    name: "qrtap_set_smart_rules",
    description:
      "REPLACE the Smart Links rules of one code — conditional redirects evaluated on every scan, first match wins, falling back to the code's primary destination when nothing matches. Typical uses: send iOS and Android scans to their own app stores, serve a Russian and a Kyrgyz page, or point at the delivery menu outside opening hours. The array you pass becomes the complete rule set, so read the current one with qrtap_get_smart_rules first; passing [] clears all rules. At most 5 rules.",
    inputSchema: {
      type: "object",
      properties: {
        codeId: {
          type: "string",
          description:
            "The code id (UUID), as returned by qrtap_create_code, qrtap_create_codes_bulk or qrtap_list_codes. This is the internal id, not the short_url slug.",
        },
        rules: {
          type: "array",
          description:
            "The complete new rule set, max 5, evaluated top to bottom. Each rule is {\"if\": <condition>, \"to\": \"<http/https url>\"}. Pass [] to remove every rule.",
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              if: {
                type: "object",
                description:
                  "Exactly one condition. Device: {\"kind\":\"device\",\"in\":[\"ios\",\"android\",\"desktop\",\"other\"]}. Language: {\"kind\":\"lang\",\"in\":[\"ru\",\"ky\"]} (primary subtags). Local time: {\"kind\":\"hours\",\"tz\":\"Asia/Bishkek\",\"from\":\"09:00\",\"to\":\"18:00\",\"days\":[1,2,3,4,5]} — 24h HH:MM, `to` exclusive, from>to crosses midnight, days are ISO weekdays 1=Mon..7=Sun and may be omitted for every day.",
              },
              to: { type: "string", description: "Destination URL for this rule (http/https)." },
            },
            required: ["if", "to"],
          },
        },
      },
      required: ["codeId", "rules"],
      additionalProperties: false,
    },
  },
];

class ToolInputError extends Error {}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ToolInputError(`Missing required string argument: ${key}`);
  }
  return value.trim();
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ToolInputError(`Argument ${key} must be a string.`);
  return value;
}

function requireObject(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ToolInputError(`Missing required object argument: ${key}`);
  }
  return value as Record<string, unknown>;
}

function requireArray(args: Record<string, unknown>, key: string): unknown[] {
  const value = args[key];
  if (!Array.isArray(value)) throw new ToolInputError(`Argument ${key} must be an array.`);
  return value;
}

/** Optional integer argument, returned as a string for the query builder. */
function optionalInt(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ToolInputError(`Argument ${key} must be an integer.`);
  }
  return String(value);
}

/**
 * Map one bulk item from the tool's vocabulary (url/title) onto the API's
 * (target_url/label). Unknown keys are dropped here rather than forwarded, so a
 * confused model cannot smuggle arbitrary fields into the request body.
 */
function bulkItemToBody(item: unknown, index: number): Record<string, string> {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    throw new ToolInputError(`items[${index}] must be an object.`);
  }
  const source = item as Record<string, unknown>;
  const url = source.url ?? source.target_url;
  if (typeof url !== "string" || url.trim() === "") {
    throw new ToolInputError(`items[${index}] is missing a url.`);
  }
  const body: Record<string, string> = { target_url: url.trim() };
  const label = source.title ?? source.label;
  if (typeof label === "string" && label !== "") body.label = label;
  if (typeof source.external_ref === "string" && source.external_ref !== "") {
    body.external_ref = source.external_ref;
  }
  if (typeof source.group === "string" && source.group !== "") {
    if (!CODE_GROUPS.includes(source.group as (typeof CODE_GROUPS)[number])) {
      throw new ToolInputError(
        `items[${index}].group must be one of: ${CODE_GROUPS.join(", ")}.`,
      );
    }
    body.group = source.group;
  }
  if (typeof source.design_template_id === "string" && source.design_template_id !== "") {
    body.design_template_id = source.design_template_id;
  }
  return body;
}

export const REVIEW_STATUSES = ["pending", "published", "hidden"] as const;
export const BOOKING_STATUSES = ["new", "confirmed", "declined"] as const;

/**
 * Optional enum argument: `fallback` is used when it is omitted (undefined =
 * drop the parameter entirely, which the API reads as "no filter").
 */
function optionalEnum(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
  fallback?: string,
): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ToolInputError(`Argument ${key} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}

/** Required enum argument — rejected locally before any HTTP call. */
function requireEnum(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
): string {
  const value = optionalEnum(args, key, allowed);
  if (value === undefined) {
    throw new ToolInputError(`Missing required argument ${key} (one of: ${allowed.join(", ")}).`);
  }
  return value;
}

/** Give up on a stalled API call rather than hanging the agent indefinitely. */
export const REQUEST_TIMEOUT_MS = 20_000;

/** One place that performs the HTTP call — every tool maps through here. */
async function request(
  config: QrtapConfig,
  method: "GET" | "POST" | "PATCH" | "PUT",
  path: string,
  options: { body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<ToolResult> {
  const url = new URL(path, config.apiUrl.endsWith("/") ? config.apiUrl : `${config.apiUrl}/`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  const fetchImpl = config.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      method,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (error) {
    // Network failure, DNS problem or timeout — a readable result beats a throw,
    // because the agent can then tell the user what went wrong and retry.
    const reason = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Could not reach the QRTap API at ${url.origin} (${method} /${path}): ${reason}. Check connectivity and QRTAP_API_URL, then retry.`,
        },
      ],
    };
  }

  const text = await response.text();
  let pretty = text;
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // non-JSON body (should not happen on JSON endpoints) — return as-is
  }

  if (!response.ok) {
    return {
      isError: true,
      content: [{ type: "text", text: `QRTap API error (HTTP ${response.status}):\n${pretty}` }],
    };
  }
  return { content: [{ type: "text", text: pretty }] };
}

/**
 * Execute a tool by name. Unknown names throw — the server layer converts that
 * into a JSON-RPC "invalid params" error, as the MCP spec prescribes.
 */
export async function callTool(
  name: string,
  rawArgs: unknown,
  config: QrtapConfig,
): Promise<ToolResult> {
  const args = asRecord(rawArgs);
  try {
    switch (name) {
      case "qrtap_create_code": {
        const body: Record<string, string> = { target_url: requireString(args, "url") };
        const title = optionalString(args, "title");
        if (title) body.label = title;
        const externalRef = optionalString(args, "external_ref");
        if (externalRef) body.external_ref = externalRef;
        const group = optionalEnum(args, "group", CODE_GROUPS);
        if (group) body.group = group;
        const templateId = optionalString(args, "design_template_id");
        if (templateId) body.design_template_id = templateId;
        return await request(config, "POST", "api/v1/codes", { body });
      }
      case "qrtap_create_codes_bulk": {
        const items = requireArray(args, "items");
        if (items.length === 0) throw new ToolInputError("items must contain at least one code.");
        if (items.length > 500) {
          throw new ToolInputError(
            `items must contain at most 500 codes (got ${items.length}); split the batch.`,
          );
        }
        // The endpoint takes a bare array, not an envelope.
        return await request(config, "POST", "api/v1/codes/bulk", {
          body: items.map(bulkItemToBody),
        });
      }
      case "qrtap_list_codes": {
        const includeStats = args.include_stats === true;
        return await request(config, "GET", "api/v1/codes", {
          query: {
            group: optionalString(args, "group"),
            external_ref: optionalString(args, "external_ref"),
            include: includeStats ? "stats" : undefined,
            limit: optionalInt(args, "limit"),
            offset: optionalInt(args, "offset"),
          },
        });
      }
      case "qrtap_get_code": {
        const codeId = requireString(args, "codeId");
        return await request(config, "GET", `api/v1/codes/${encodeURIComponent(codeId)}`);
      }
      case "qrtap_code_history": {
        const codeId = requireString(args, "codeId");
        return await request(config, "GET", `api/v1/codes/${encodeURIComponent(codeId)}/history`);
      }
      case "qrtap_group_stats": {
        const group = requireString(args, "group");
        return await request(config, "GET", `api/v1/groups/${encodeURIComponent(group)}/stats`, {
          query: { from: optionalString(args, "from"), to: optionalString(args, "to") },
        });
      }
      case "qrtap_list_design_templates": {
        return await request(config, "GET", "api/v1/design-templates");
      }
      case "qrtap_change_destination": {
        const codeId = requireString(args, "codeId");
        return await request(config, "PATCH", `api/v1/codes/${encodeURIComponent(codeId)}`, {
          body: { target_url: requireString(args, "url") },
        });
      }
      case "qrtap_code_stats": {
        const codeId = requireString(args, "codeId");
        return await request(config, "GET", `api/v1/codes/${encodeURIComponent(codeId)}/stats`, {
          query: { from: optionalString(args, "from"), to: optionalString(args, "to") },
        });
      }
      case "qrtap_create_short_link": {
        return await request(config, "POST", "api/v1/codes", {
          body: { target_url: requireString(args, "url") },
        });
      }
      case "qrtap_create_page": {
        return await request(config, "POST", "api/v1/pages", {
          body: { content: requireObject(args, "content") },
        });
      }
      case "qrtap_update_page": {
        const slug = requireString(args, "slug");
        return await request(config, "PATCH", `api/v1/pages/${encodeURIComponent(slug)}`, {
          body: { content: requireObject(args, "content") },
        });
      }
      case "qrtap_get_page": {
        const slug = requireString(args, "slug");
        return await request(config, "GET", `api/v1/pages/${encodeURIComponent(slug)}`);
      }
      case "qrtap_list_pages": {
        return await request(config, "GET", "api/v1/pages");
      }
      case "qrtap_list_reviews": {
        return await request(config, "GET", "api/v1/reviews", {
          query: { status: optionalEnum(args, "status", REVIEW_STATUSES, "pending") },
        });
      }
      case "qrtap_moderate_review": {
        const reviewId = requireString(args, "reviewId");
        return await request(
          config,
          "POST",
          `api/v1/reviews/${encodeURIComponent(reviewId)}/moderate`,
          { body: { action: requireEnum(args, "action", ["publish", "hide"]) } },
        );
      }
      case "qrtap_list_bookings": {
        return await request(config, "GET", "api/v1/bookings", {
          query: { status: optionalEnum(args, "status", BOOKING_STATUSES) },
        });
      }
      case "qrtap_set_booking_status": {
        const bookingId = requireString(args, "bookingId");
        return await request(
          config,
          "POST",
          `api/v1/bookings/${encodeURIComponent(bookingId)}/status`,
          { body: { status: requireEnum(args, "status", ["confirmed", "declined"]) } },
        );
      }
      case "qrtap_get_smart_rules": {
        const codeId = requireString(args, "codeId");
        return await request(
          config,
          "GET",
          `api/v1/codes/${encodeURIComponent(codeId)}/smart-rules`,
        );
      }
      case "qrtap_set_smart_rules": {
        const codeId = requireString(args, "codeId");
        return await request(
          config,
          "PUT",
          `api/v1/codes/${encodeURIComponent(codeId)}/smart-rules`,
          { body: { rules: requireArray(args, "rules") } },
        );
      }
      default:
        throw new UnknownToolError(name);
    }
  } catch (error) {
    if (error instanceof UnknownToolError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}

export class UnknownToolError extends Error {
  constructor(public toolName: string) {
    super(`Unknown tool: ${toolName}`);
  }
}
