import { GOOGLE_FONTS, GOOGLE_FONT_FAMILIES } from "../shared/google-fonts.mjs";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models?limit=100";
let fontCatalogCache = null;
let anthropicModelCache = null;

const schemas = {
  brand_profile: {
    type: "object",
    additionalProperties: false,
    required: ["companyName", "summary", "services", "audiences", "markets", "differentiators", "voice", "contentPillars", "verifiedFacts", "unknowns", "confidence"],
    properties: {
      companyName: { type: "string" },
      summary: { type: "string" },
      services: { type: "array", items: { type: "string" } },
      audiences: { type: "array", items: { type: "string" } },
      markets: { type: "array", items: { type: "string" } },
      differentiators: { type: "array", items: { type: "string" } },
      voice: { type: "object", additionalProperties: false, required: ["language", "dialect", "traits", "do", "avoid"], properties: {
        language: { type: "string" }, dialect: { type: "string" }, traits: { type: "array", items: { type: "string" } }, do: { type: "array", items: { type: "string" } }, avoid: { type: "array", items: { type: "string" } }
      } },
      contentPillars: { type: "array", items: { type: "string" } },
      verifiedFacts: { type: "array", items: { type: "string" } },
      unknowns: { type: "array", items: { type: "string" } },
      confidence: { type: "number", minimum: 0, maximum: 100 }
    }
  },
  linkedin_content: {
    type: "object",
    additionalProperties: false,
    required: ["angle", "alternativeAngles", "hook", "post", "cta", "hashtags", "recommendedFormat", "designCopy", "carouselSlides", "factsUsed"],
    properties: {
      angle: { type: "string" },
      alternativeAngles: { type: "array", minItems: 2, maxItems: 2, items: { type: "string" } },
      hook: { type: "string" }, post: { type: "string" }, cta: { type: "string" },
      hashtags: { type: "array", items: { type: "string" } },
      recommendedFormat: { type: "string", enum: ["single_image", "carousel", "text_only"] },
      designCopy: { type: "object", additionalProperties: false, required: ["headline", "body", "category", "slideType"], properties: {
        headline: { type: "string" }, body: { type: "string" }, category: { type: "string" },
        slideType: { type: "string", enum: ["hook", "explanatory", "quote", "conclusion", "comparison", "numbered", "statement", "standard"] }
      } },
      carouselSlides: { type: "array", items: { type: "object", additionalProperties: false, required: ["headline", "body", "category", "slideType"], properties: {
        headline: { type: "string" }, body: { type: "string" }, category: { type: "string" },
        slideType: { type: "string", enum: ["hook", "explanatory", "quote", "conclusion", "comparison", "numbered", "statement", "standard"] }
      } } },
      factsUsed: { type: "array", items: { type: "string" } }
    }
  },
  design_spec: {
    type: "object",
    additionalProperties: false,
    required: ["format", "concept", "layout", "headline", "body", "footer", "palette", "typography", "imageDirection", "slides"],
    properties: {
      format: { type: "string", enum: ["single_image", "carousel"] }, concept: { type: "string" },
      layout: { type: "string", enum: ["split", "editorial", "minimal"] },
      headline: { type: "string" }, body: { type: "string" }, footer: { type: "string" },
      palette: { type: "array", minItems: 3, maxItems: 5, items: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" } },
      typography: { type: "object", additionalProperties: false, required: ["fontFamily", "titleWeight", "bodyWeight", "rationale"], properties: {
        fontFamily: { type: "string", enum: GOOGLE_FONT_FAMILIES },
        titleWeight: { type: "integer", enum: [400, 700] },
        bodyWeight: { type: "integer", enum: [400, 700] },
        rationale: { type: "string" }
      } },
      imageDirection: { type: "string" },
      slides: { type: "array", items: { type: "object", additionalProperties: false, required: ["headline", "body", "footer", "visualDirection"], properties: { headline: { type: "string" }, body: { type: "string" }, footer: { type: "string" }, visualDirection: { type: "string" } } } }
    }
  }
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function normalizeFontCatalog(items = []) {
  return items.map((font) => ({
    family: font.family,
    scripts: font.subsets || font.scripts || [],
    variants: font.variants || [],
    category: font.category || ""
  })).filter((font) => font.family).sort((a, b) => a.family.localeCompare(b.family));
}

async function fetchFontCatalog(apiKey) {
  if (fontCatalogCache) return fontCatalogCache;
  try {
    const url = apiKey
      ? `https://www.googleapis.com/webfonts/v1/webfonts?sort=alpha&key=${encodeURIComponent(apiKey)}`
      : "https://fonts.google.com/metadata/fonts";
    const response = await fetch(url, { headers: { "User-Agent": "ThreeContentStudio/1.0" } });
    if (!response.ok) throw new Error(`Google Fonts returned ${response.status}`);
    const raw = await response.text();
    const payload = JSON.parse(raw.replace(/^\)\]\}'\s*/, ""));
    const items = payload.items || payload.familyMetadataList || [];
    const fonts = normalizeFontCatalog(items);
    if (!fonts.length) throw new Error("Empty Google Fonts catalog");
    fontCatalogCache = { fonts, source: apiKey ? "google_developer_api" : "google_metadata" };
  } catch {
    fontCatalogCache = { fonts: GOOGLE_FONTS, source: "curated_fallback" };
  }
  return fontCatalogCache;
}

function designSchemaFor(fontFamilies) {
  const schema = JSON.parse(JSON.stringify(schemas.design_spec));
  schema.properties.typography.properties.fontFamily.enum = fontFamilies;
  return schema;
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("Request too large");
  }
  return raw ? JSON.parse(raw) : {};
}

function safeUrl(input) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) URLs are supported");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local") || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) throw new Error("Private network URLs are not supported");
  return url;
}

function cleanText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim().slice(0, 32_000);
}

function discoverVisuals(html, baseUrl) {
  const colors = [...html.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toUpperCase());
  const counts = new Map(); colors.forEach((color) => counts.set(color, (counts.get(color) || 0) + 1));
  const palette = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([color]) => color).filter((color) => !["#FFFFFF", "#000000"].includes(color)).slice(0, 5);
  const logoMatch = html.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*(?:logo|brand)|<img[^>]+(?:logo|brand)[^>]+(?:src|data-src)=["']([^"']+)["']/i);
  let logoUrl = "";
  try { if (logoMatch) logoUrl = new URL(logoMatch[1] || logoMatch[2], baseUrl).href; } catch { /* ignore invalid asset */ }
  const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-fA-F]{6})["']/i)?.[1];
  return { palette: theme ? [theme.toUpperCase(), ...palette.filter((c) => c !== theme.toUpperCase())].slice(0, 5) : palette, logoUrl };
}

async function fetchWebsite(input) {
  const url = safeUrl(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "User-Agent": "BrandContentAnalyst/1.0" } });
    if (!response.ok) throw new Error(`Website returned ${response.status}`);
    const html = (await response.text()).slice(0, 600_000);
    return { finalUrl: response.url, text: cleanText(html), visuals: discoverVisuals(html, response.url) };
  } finally { clearTimeout(timer); }
}

function outputText(response) {
  for (const item of response.output || []) for (const content of item.content || []) if (content.type === "output_text" && content.text) return content.text;
  throw new Error("The model returned no structured output");
}

async function runAgent({ apiKey, model, name, schema, instructions, input }) {
  if (!apiKey) throw Object.assign(new Error("OPENAI_API_KEY is not configured"), { code: "missing_api_key" });
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, instructions, input, text: { format: { type: "json_schema", name, strict: true, schema } } })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI request failed (${response.status})`);
  return JSON.parse(outputText(payload));
}

async function resolveAnthropicModel(apiKey, preferredModel) {
  if (anthropicModelCache) return anthropicModelCache;
  const response = await fetch(ANTHROPIC_MODELS_URL, {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || `Could not list Anthropic models (${response.status})`);
  const available = (payload.data || []).map((item) => item.id).filter(Boolean);
  anthropicModelCache = available.includes(preferredModel)
    ? preferredModel
    : available.find((id) => /sonnet/i.test(id)) || available[0];
  if (!anthropicModelCache) throw new Error("No Claude models are available for this Anthropic API key");
  return anthropicModelCache;
}

async function runClaude({ apiKey, model, schema, instructions, input, toolName = "submit_structured_output", toolDescription = "Return the final structured result." }) {
  if (!apiKey) throw Object.assign(new Error("ANTHROPIC_API_KEY is not configured"), { code: "missing_anthropic_api_key" });
  const availableModel = await resolveAnthropicModel(apiKey, model);
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: availableModel,
      max_tokens: 4096,
      system: instructions,
      messages: [{ role: "user", content: input }],
      tools: [{ name: toolName, description: toolDescription, input_schema: schema }],
      tool_choice: { type: "tool", name: toolName }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || `Anthropic request failed (${response.status})`);
  const toolUse = payload.content?.find((block) => block.type === "tool_use" && block.name === toolName);
  if (!toolUse?.input) throw new Error("Claude returned no structured output");
  return toolUse.input;
}

export function createAgentsMiddleware({ apiKey, model, googleFontsApiKey, anthropicApiKey, anthropicModel }) {
  return async function agentsMiddleware(req, res, next) {
    if (!req.url?.startsWith("/api/")) return next();
    if (req.method === "GET" && req.url === "/api/status") return json(res, 200, {
      configured: Boolean(apiKey),
      model,
      writerConfigured: Boolean(anthropicApiKey),
      writerModel: anthropicModel,
      designerConfigured: Boolean(anthropicApiKey),
      designerModel: anthropicModel
    });
    if (req.method === "GET" && req.url === "/api/fonts") {
      const catalog = await fetchFontCatalog(googleFontsApiKey);
      return json(res, 200, catalog);
    }
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    try {
      const body = await readJson(req);
      if (req.url === "/api/agents/analyze") {
        const site = await fetchWebsite(body.url);
        const result = await runAgent({ apiKey, model, name: "brand_profile", schema: schemas.brand_profile,
          instructions: "You are Brand Analyst, the first of three agents. Analyze only the supplied website evidence. Extract verified company facts, services, audiences, markets, differentiation, brand voice, and useful LinkedIn content pillars. Never invent numbers, customers, outcomes, or services. Put missing or uncertain information in unknowns. Write the entire structured response in the user's requested content language.",
          input: `Requested content language: ${body.contentLanguage === "English" ? "English" : "Arabic"}\nSource URL: ${site.finalUrl}\nDetected visual signals: ${JSON.stringify(site.visuals)}\nAdditional client context: ${body.context || "none"}\nWebsite text:\n${site.text}` });
        return json(res, 200, { result, source: { url: site.finalUrl, ...site.visuals } });
      }
      if (req.url === "/api/agents/write") {
        const styleExamples = Array.isArray(body.brief?.styleExamples)
          ? body.brief.styleExamples.filter(Boolean).slice(0, 3)
          : String(body.brief?.styleExamples || "").trim() ? [String(body.brief.styleExamples).trim()] : [];
        const result = await runClaude({ apiKey: anthropicApiKey, model: anthropicModel, schema: schemas.linkedin_content,
          toolName: "submit_linkedin_content", toolDescription: "Return the final approved LinkedIn content and design copy.",
          instructions: "You are LinkedIn Content Strategist and carousel editor, the second of three agents. Use only the approved brand profile and user brief. Never add unsupported claims.\n\nBANNED PATTERNS — never use these, in any language: generic openers like 'In today's world', 'في عالم اليوم', 'الحقيقة إن', 'دعني أخبرك'; rhetorical questions as openers ('هل تعلم أن...?', 'Did you know...?'); rocket/fire/sparkle emojis or any emoji used as a bullet marker; three-item listicle structures unless the content is genuinely three real steps; corporate filler words (unlock, leverage, seamless, game-changer, revolutionize, تمكين, نقلة نوعية, ثورة في); a hook that just restates the headline as a question; closing with 'What do you think? Comment below' unless the brief goal is genuinely to spark discussion. If the brand voice 'avoid' list bans something, treat it as equally forbidden.\n\nVOICE MATCHING: If styleExamples are supplied, they are real posts the client already likes. Match their sentence rhythm, average sentence length, and level of formality closely — treat them as the ground truth for voice, weighted above the generic brand voice traits. Do not copy their specific claims or sentences, only the writing style.\n\nCreate designCopy with one short visual idea: headline maximum 6-8 words, body maximum 20-25 words, category maximum two words, and an accurate slideType. Never shrink or overload design copy. If recommendedFormat is text_only, still populate designCopy from the post's core idea in case the user changes format later, and return an empty carouselSlides array. For single_image, return an empty carouselSlides array. For carousel, produce 4-7 slides, exactly one idea per slide. Each carousel headline is maximum 6-8 words and each body is maximum 20-25 words. The first slide is slideType hook and the last is conclusion. Use comparison only for real contrast, numbered for steps or numbered ideas, quote for a genuine voice/opinion, statement for a short strong assertion, explanatory for analysis, and standard otherwise. Do not lose meaning or add claims while splitting.\n\nChoose one sharp, non-generic angle for the main post. Also return alternativeAngles: exactly two other genuinely different one-line angle ideas (different enough that picking one would change the whole post, not just its phrasing) that this brand could also credibly post about right now, so the user can pick a different direction without leaving the app. Return factsUsed so the user can audit the copy.",
          input: `Approved brand profile:\n${JSON.stringify(body.brandProfile)}\nContent brief:\n${JSON.stringify(body.brief)}${styleExamples.length ? `\nReal posts to match the voice of (style only, do not reuse claims):\n${styleExamples.map((example, i) => `Example ${i + 1}:\n${example}`).join("\n\n")}` : ""}` });
        result.recommendedFormat = body.brief?.format === "carousel" ? "carousel" : body.brief?.format === "text_only" ? "text_only" : "single_image";
        if (result.recommendedFormat !== "carousel") result.carouselSlides = [];
        return json(res, 200, { result });
      }
      if (req.url === "/api/agents/design") {
        const preferredFont = String(body.brandKit?.preferredFont || "auto").trim();
        const allowedFonts = preferredFont === "auto" ? GOOGLE_FONT_FAMILIES : [preferredFont];
        const fontOptions = preferredFont === "auto" ? GOOGLE_FONTS : [{ family: preferredFont, scripts: [], mood: "user selected" }];
        const result = await runClaude({ apiKey: anthropicApiKey, model: anthropicModel, schema: designSchemaFor(allowedFonts),
          toolName: "submit_design_spec", toolDescription: "Return the final production-ready LinkedIn design specification.",
          instructions: "You are Brand Visual Director, the third of three agents. Turn the approved LinkedIn content into a clear production-ready design specification. The approved content format is mandatory: use exactly content.recommendedFormat. Every design must have three explicit content roles: headline is the primary attention message, body is the supporting explanation, and footer is a short CTA, brand signature, or page cue. Apply the same headline/body/footer hierarchy to every carousel slide. Use this fixed 1080×1080 typography system: Headline: 84 px font size / 100 px line height — Bold. Body: 38 px font size / 56 px line height — Regular. Footer: 26 px font size / 36 px line height — Medium. Keep all essential content inside 90 px safe margins on every side. Choose typography only from the supplied Google Fonts catalog, considering language support, brand voice, and legibility. If preferredFont is not 'auto', use that exact font. Respect the supplied logo, palette, and content hierarchy. Keep Arabic text short and legible. Do not alter facts or add marketing claims. For single_image return an empty slides array; for carousel return 4-7 slides. Use only valid hex colors.",
          input: `Brand profile:\n${JSON.stringify(body.brandProfile)}\nApproved content:\n${JSON.stringify(body.content)}\nBrand kit:\n${JSON.stringify(body.brandKit)}\nAllowed Google Fonts:\n${JSON.stringify(fontOptions)}` });
        result.format = body.content?.recommendedFormat === "carousel" ? "carousel" : "single_image";
        if (result.format === "single_image") result.slides = [];
        return json(res, 200, { result });
      }
      return json(res, 404, { error: "Unknown API route" });
    } catch (error) {
      const status = ["missing_api_key", "missing_anthropic_api_key"].includes(error.code) ? 503 : 400;
      return json(res, status, { error: error.message, code: error.code || "agent_error" });
    }
  };
}
