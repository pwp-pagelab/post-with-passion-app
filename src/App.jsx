import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, Brain, Check, Copy, DownloadSimple, Globe, ImageSquare,
  MagicWand, MagnifyingGlass, Palette, PencilSimple, ShieldCheck, Sparkle, UploadSimple, WarningCircle
} from "@phosphor-icons/react";
import { GOOGLE_FONTS, googleFontCssUrl } from "../shared/google-fonts.mjs";

const initialRuns = { analyst: "idle", writer: "idle", designer: "idle" };
const defaultBrand = "";
const embeddedFontCache = new Map();
const PWP_MOTIFS = {
  A: "Bold editorial: one oversized translucent word or letter at 6–10% opacity, one small colored tag, and one short separator rule. No other decoration.",
  B: "Swiss grid: exactly two subtle grid lines at 8% opacity, a prominent corner page number, and a two-pixel side rule on the body. No other decoration.",
  C: "Warm human: exactly two overlapping organic circles from the palette, one translucent quotation mark, and one circular avatar placeholder.",
  D: "Dark premium: exactly two overlapping geometric green layers, one thin solid gold horizontal line, and one small brand signature.",
  E: "Diagonal split: exactly one diagonal triangle separating two shades from the same color family. No additional visual element.",
  F: "Big number anchor: one oversized translucent number at 8% opacity and one thin horizontal separator.",
  G: "Inset frame: one one-pixel frame inset 20 px from the edges and one small centered signature at the bottom.",
  H: "Layered typography: one small category label above the headline, one translucent ghost word in the background, and one thin top rule above the body."
};
const MOTIF_OPTIONS = {
  hook: ["A", "H"], explanatory: ["B", "H"], quote: ["C", "G"], conclusion: ["D", "G"],
  comparison: ["E"], numbered: ["F"], statement: ["G", "A"], standard: ["H", "B"]
};
const CATEGORY_BY_TYPE = { hook: "فكرة أساسية", explanatory: "شرح الفكرة", quote: "صوت إنساني", conclusion: "الخلاصة", comparison: "مقارنة", numbered: "خطوات عملية", statement: "رسالة أساسية", standard: "فكرة أساسية" };

function words(value = "") { return String(value).trim().split(/\s+/).filter(Boolean); }
function limitWords(value = "", max = 25) { const list = words(value); return list.length > max ? `${list.slice(0, max).join(" ")}…` : list.join(" "); }
function inferSlideType(slide, index, total) {
  if (slide?.slideType) return slide.slideType;
  if (index === 0) return "hook";
  if (index === total - 1) return "conclusion";
  const text = `${slide?.headline || ""} ${slide?.body || ""}`;
  if (/\b\d+\b|خطوات|نصائح|أسباب|steps|tips/i.test(text)) return "numbered";
  if (/مقارنة|مقابل|قبل|بعد|versus|\bvs\b/i.test(text)) return "comparison";
  if (/قال|رأي|اقتباس|quote|said/i.test(text)) return "quote";
  return index % 2 ? "explanatory" : "standard";
}
function assignMotifs(pages) {
  let previous = "";
  return pages.map((page, index) => {
    const options = MOTIF_OPTIONS[page.slideType] || MOTIF_OPTIONS.standard;
    const motif = options.find((item) => item !== previous) || options[0];
    previous = motif;
    return { ...page, motif, pageNumber: String(index + 1).padStart(2, "0") };
  });
}

function escapeXml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function bidiSafe(value = "") {
  const text = String(value);
  const arabic = /[\u0600-\u06FF]/.test(text);
  if (!arabic) return text;
  // Wrap digit runs in RLM (U+200F) so numbers stay anchored in their
  // correct reading position inside right-to-left sentences instead of
  // being pushed to the visual end of the line by the browser's bidi algorithm.
  return text.replace(/([0-9]+)/g, "\u200F$1\u200F");
}

function wrapText(value = "", limit = 24) {
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > limit && current) { lines.push(current); current = word; }
    else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

function svgText({ text, x, y, size, lineHeight, weight, fill, anchor, maxLines, limit }) {
  return wrapText(text, limit).slice(0, maxLines).map((line, index) =>
    `<text x="${x}" y="${y + index * lineHeight}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" direction="auto">${escapeXml(bidiSafe(line))}</text>`
  ).join("");
}

async function imageDataUrl(src) {
  if (!src || src.startsWith("data:")) return src || "";
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    return await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
  } catch { return ""; }
}

async function blobDataUrl(blob) {
  return await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
}

async function embedGoogleFontCss(family, text) {
  const key = `${family}::${text}`;
  if (embeddedFontCache.has(key)) return embeddedFontCache.get(key);
  const cssParts = [];
  for (const weight of [400, 500, 700]) {
    try {
      const response = await fetch(googleFontCssUrl(family, { weight, text }));
      if (response.ok) cssParts.push(await response.text());
    } catch { /* unsupported weights are skipped */ }
  }
  if (!cssParts.length) throw new Error(`تعذّر تحميل خط ${family} من Google Fonts`);
  let css = cssParts.join("\n");
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((match) => match[1].replace(/["']/g, "")))];
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) continue;
    const dataUrl = await blobDataUrl(await response.blob());
    css = css.split(url).join(dataUrl);
  }
  embeddedFontCache.set(key, css);
  return css;
}

function downloadBlob(contents, filename, type = "image/svg+xml") {
  const href = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = href; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

async function makeDesignPngBlob({ headline, body, footer, palette, font, logo, page = 1 }) {
  if (document.fonts?.load) {
    await Promise.all([document.fonts.load(`700 84px "${font}"`), document.fonts.load(`400 38px "${font}"`)]);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  const background = palette[(page - 1) % palette.length] || "#0E3A31";
  const accent = palette[1] || "#D7C196";
  const foreground = page % palette.length === 0 ? (palette[0] || "#0E3A31") : "#FFFFFF";
  const arabic = /[\u0600-\u06FF]/.test(`${headline} ${body} ${footer}`);
  const x = arabic ? 990 : 90;
  ctx.fillStyle = background; ctx.fillRect(0, 0, 1080, 1080);
  ctx.fillStyle = accent; ctx.fillRect(arabic ? 930 : 90, 210, 60, 10);
  if (logo) {
    try {
      const image = await new Promise((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = logo; });
      const ratio = Math.min(160 / image.width, 90 / image.height);
      ctx.drawImage(image, arabic ? 990 - image.width * ratio : 90, 70, image.width * ratio, image.height * ratio);
    } catch { /* export continues without an inaccessible logo */ }
  }
  ctx.direction = arabic ? "rtl" : "ltr"; ctx.textAlign = arabic ? "right" : "left"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = foreground;
  ctx.font = `700 84px "${font}", Arial, sans-serif`;
  wrapText(headline, 22).slice(0, 3).forEach((line, index) => ctx.fillText(line, x, 360 + index * 100));
  ctx.font = `400 38px "${font}", Arial, sans-serif`;
  wrapText(body, 42).slice(0, 4).forEach((line, index) => ctx.fillText(line, x, 700 + index * 56));
  ctx.globalAlpha = .25; ctx.fillRect(90, 940, 900, 1); ctx.globalAlpha = 1;
  ctx.font = `500 26px "${font}", Arial, sans-serif`; ctx.fillText(footer, x, 1000);
  ctx.direction = "ltr"; ctx.textAlign = arabic ? "left" : "right"; ctx.globalAlpha = .7; ctx.font = `400 22px "${font}", Arial, sans-serif`; ctx.fillText(String(page).padStart(2, "0"), arabic ? 90 : 990, 1000); ctx.globalAlpha = 1;
  return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed")), "image/png", 1));
}

function footerBlock({ x, arabic, foreground, pageNumber, page, category }) {
  return `<line x1="90" y1="972" x2="990" y2="972" stroke="${foreground}" stroke-opacity="0.25"/>
    <text x="${arabic ? 90 : 990}" y="1022" fill="${foreground}" font-size="22" font-weight="600" text-anchor="${arabic ? "start" : "end"}" direction="ltr">${escapeXml(pageNumber || String(page).padStart(2, "0"))}</text>
    <text x="${arabic ? 990 : 90}" y="1022" fill="${foreground}" font-size="22" font-weight="600" text-anchor="${arabic ? "end" : "start"}" direction="auto">${escapeXml(bidiSafe(category || ""))}</text>`;
}

function makeDesignSvg({ headline, body, footer, category, motif, pageNumber, palette, font, fontCss = "", logo, page = 1 }) {
  const dark = palette[0] || "#0E3A31";
  const green = palette[1] || "#168164";
  const gold = palette[2] || "#D7C196";
  const light = palette[3] || "#F5F1E8";
  const arabic = /[\u0600-\u06FF]/.test(`${headline} ${body} ${footer}`);
  const x = arabic ? 990 : 90;
  const anchor = arabic ? "end" : "start";
  const fontStyles = fontCss ? fontCss.replace(/<\/style/gi, "") : `@import url("${escapeXml(googleFontCssUrl(font))}");`;
  const styleTag = `<style>${fontStyles} text{font-family:'${escapeXml(font)}',Arial,sans-serif}</style>`;
  const logoTag = logo ? `<image href="${escapeXml(logo)}" x="${arabic ? 830 : 90}" y="60" width="190" height="40" preserveAspectRatio="${arabic ? "xMaxYMid" : "xMinYMid"} meet"/>` : "";
  const ghostWord = words(headline).slice(0, 1).join("") || "PWP";

  if (motif === "A") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      ${styleTag}
      <rect width="1080" height="1080" fill="${dark}"/>
      <text x="${x}" y="640" fill="${light}" fill-opacity="0.08" font-size="620" font-weight="800" text-anchor="${anchor}" direction="auto">${escapeXml(ghostWord)}</text>
      ${logoTag}
      <rect x="${arabic ? 900 : 90}" y="150" width="90" height="34" rx="17" fill="${gold}"/>
      <text x="${arabic ? 945 : 135}" y="173" fill="${dark}" font-size="16" font-weight="700" text-anchor="middle">${escapeXml(bidiSafe(category || ""))}</text>
      ${svgText({ text: headline, x, y: 340, size: 78, lineHeight: 92, weight: 800, fill: light, anchor, maxLines: 3, limit: 20 })}
      <line x1="90" y1="640" x2="${arabic ? 300 : 990}" y2="640" stroke="${gold}" stroke-width="4"/>
      ${footerBlock({ x, arabic, foreground: light, pageNumber, page, category })}
    </svg>`;
  }

  if (motif === "B") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      ${styleTag}
      <rect width="1080" height="1080" fill="${light}"/>
      <line x1="0" y1="360" x2="1080" y2="360" stroke="${dark}" stroke-opacity="0.08"/>
      <line x1="0" y1="720" x2="1080" y2="720" stroke="${dark}" stroke-opacity="0.08"/>
      ${logoTag}
      <text x="${arabic ? 90 : 990}" y="130" fill="${dark}" fill-opacity="0.18" font-size="90" font-weight="800" text-anchor="${arabic ? "start" : "end"}" direction="ltr">${escapeXml(pageNumber || String(page).padStart(2, "0"))}</text>
      ${svgText({ text: headline, x, y: 420, size: 68, lineHeight: 82, weight: 700, fill: dark, anchor, maxLines: 3, limit: 22 })}
      <rect x="${arabic ? 984 : 90}" y="560" width="6" height="220" fill="${green}"/>
      ${svgText({ text: body, x: arabic ? 964 : 110, y: 600, size: 34, lineHeight: 50, weight: 400, fill: dark, anchor, maxLines: 4, limit: 38 })}
      ${footerBlock({ x, arabic, foreground: dark, pageNumber, page, category })}
    </svg>`;
  }

  if (motif === "C") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      ${styleTag}
      <rect width="1080" height="1080" fill="${gold}"/>
      <circle cx="${arabic ? 900 : 180}" cy="230" r="150" fill="${green}" fill-opacity="0.35"/>
      <circle cx="${arabic ? 820 : 260}" cy="330" r="100" fill="${dark}" fill-opacity="0.25"/>
      <circle cx="${arabic ? 860 : 220}" cy="280" r="46" fill="${light}"/>
      ${logoTag}
      <text x="${x}" y="430" fill="${dark}" fill-opacity="0.18" font-size="150" font-weight="800" text-anchor="${anchor}" direction="ltr">”</text>
      ${svgText({ text: headline, x, y: 560, size: 62, lineHeight: 78, weight: 700, fill: dark, anchor, maxLines: 3, limit: 22 })}
      ${svgText({ text: body, x, y: 780, size: 34, lineHeight: 50, weight: 400, fill: dark, anchor, maxLines: 3, limit: 38 })}
      ${footerBlock({ x, arabic, foreground: dark, pageNumber, page, category })}
    </svg>`;
  }

  if (motif === "D") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      ${styleTag}
      <rect width="1080" height="1080" fill="${dark}"/>
      <rect x="${arabic ? 560 : -120}" y="-80" width="640" height="640" fill="${green}" fill-opacity="0.55" transform="rotate(18 ${arabic ? 880 : 200} 240)"/>
      <rect x="${arabic ? 460 : -60}" y="40" width="500" height="500" fill="${green}" fill-opacity="0.35" transform="rotate(-12 ${arabic ? 780 : 260} 300)"/>
      ${logoTag}
      ${svgText({ text: headline, x, y: 480, size: 72, lineHeight: 86, weight: 700, fill: light, anchor, maxLines: 3, limit: 20 })}
      <line x1="90" y1="620" x2="990" y2="620" stroke="${gold}" stroke-width="2"/>
      ${svgText({ text: body, x, y: 690, size: 34, lineHeight: 50, weight: 400, fill: light, anchor, maxLines: 3, limit: 38 })}
      ${footerBlock({ x, arabic, foreground: light, pageNumber, page, category })}
    </svg>`;
  }

  if (motif === "E") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      ${styleTag}
      <rect width="1080" height="1080" fill="${light}"/>
      <polygon points="${arabic ? "1080,0 1080,1080 300,1080" : "0,0 0,1080 780,1080"}" fill="${green}"/>
      ${logoTag}
      ${svgText({ text: headline, x: arabic ? 990 : 90, y: 300, size: 66, lineHeight: 80, weight: 700, fill: dark, anchor, maxLines: 3, limit: 20 })}
      ${svgText({ text: body, x: arabic ? 940 : 140, y: 780, size: 34, lineHeight: 50, weight: 400, fill: light, anchor, maxLines: 3, limit: 34 })}
      ${footerBlock({ x, arabic, foreground: dark, pageNumber, page, category })}
    </svg>`;
  }

  if (motif === "F") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      ${styleTag}
      <rect width="1080" height="1080" fill="${green}"/>
      ${logoTag}
      ${svgText({ text: headline, x, y: 260, size: 40, lineHeight: 52, weight: 700, fill: light, anchor, maxLines: 2, limit: 30 })}
      <text x="${x}" y="640" fill="${light}" font-size="340" font-weight="800" text-anchor="${anchor}" direction="ltr">${escapeXml(String(pageNumber || page))}</text>
      <line x1="90" y1="740" x2="990" y2="740" stroke="${light}" stroke-opacity="0.3"/>
      ${svgText({ text: body, x, y: 800, size: 32, lineHeight: 46, weight: 400, fill: light, anchor, maxLines: 2, limit: 40 })}
      ${footerBlock({ x, arabic, foreground: light, pageNumber, page, category })}
    </svg>`;
  }

  if (motif === "G") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      ${styleTag}
      <rect width="1080" height="1080" fill="${dark}"/>
      <rect x="20" y="20" width="1040" height="1040" fill="none" stroke="${gold}" stroke-width="1" stroke-opacity="0.7"/>
      ${logoTag}
      ${svgText({ text: headline, x, y: 420, size: 70, lineHeight: 84, weight: 700, fill: light, anchor, maxLines: 3, limit: 22 })}
      ${svgText({ text: body, x, y: 680, size: 34, lineHeight: 50, weight: 400, fill: light, anchor, maxLines: 3, limit: 38 })}
      <text x="540" y="1000" fill="${gold}" font-size="20" font-weight="600" text-anchor="middle">${escapeXml(bidiSafe(footer || category || ""))}</text>
      ${footerBlock({ x, arabic, foreground: light, pageNumber, page, category: "" })}
    </svg>`;
  }

  // H — Layered typography (default and fallback)
  const footerCategory = category || footer || "فكرة أساسية";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
    ${styleTag}
    <rect width="1080" height="1080" fill="${light}"/>
    ${logoTag}
    <text x="990" y="205" fill="${green}" font-size="24" font-weight="600" text-anchor="end" direction="auto">${escapeXml(bidiSafe(footerCategory))}</text>
    ${svgText({ text: headline, x: 990, y: 300, size: 70, lineHeight: 81, weight: 800, fill: dark, anchor: "end", maxLines: 3, limit: 22 })}
    <line x1="90" y1="675" x2="990" y2="675" stroke="${dark}" stroke-opacity="0.20"/>
    ${svgText({ text: body, x: 990, y: 750, size: 34, lineHeight: 51, weight: 400, fill: dark, anchor: "end", maxLines: 2, limit: 34 })}
    <text x="990" y="920" fill="${dark}" fill-opacity="0.06" font-size="170" font-weight="800" text-anchor="end" direction="auto">${escapeXml(ghostWord)}</text>
    <line x1="90" y1="972" x2="990" y2="972" stroke="${dark}" stroke-opacity="0.30"/>
    <text x="90" y="1022" fill="${dark}" font-size="22" font-weight="600" text-anchor="start" direction="ltr">${escapeXml(pageNumber || String(page).padStart(2, "0"))}</text>
    <text x="990" y="1022" fill="${dark}" font-size="22" font-weight="600" text-anchor="end" direction="auto">${escapeXml(bidiSafe(footerCategory))}</text>
  </svg>`;
}

async function rasterizeSvg(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element); element.onerror = reject; element.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1080;
    canvas.getContext("2d").drawImage(image, 0, 0, 1080, 1080);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed")), "image/png", 1));
  } finally { URL.revokeObjectURL(url); }
}

async function api(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "تعذّر تشغيل الوكيل");
  return payload;
}

function AgentCard({ number, title, role, icon, status, active }) {
  const Icon = icon;
  const statusText = status === "running" ? "يعمل الآن" : status === "done" ? "اكتمل" : status === "error" ? "حدث خطأ" : "بانتظار دوره";
  return <div className={`agent-card ${active ? "active" : ""} ${status}`}>
    <div className="agent-icon"><Icon size={21} weight="duotone" /></div>
    <div><span>AI {number}</span><b>{title}</b><small>{role}</small></div>
    <em>{status === "done" && <Check weight="bold" size={12} />}{status === "running" && <i />}{statusText}</em>
  </div>;
}

function EmptyAgent({ icon: Icon, title, text }) {
  return <div className="empty-agent"><Icon size={34} weight="duotone" /><b>{title}</b><p>{text}</p></div>;
}

export function App() {
  const [apiStatus, setApiStatus] = useState({ loading: true, configured: false, model: "", designerConfigured: false, designerModel: "" });
  const [stage, setStage] = useState(1);
  const [runs, setRuns] = useState(initialRuns);
  const [url, setUrl] = useState("");
  const [context, setContext] = useState("");
  const [profile, setProfile] = useState(null);
  const [source, setSource] = useState(null);
  const [brief, setBrief] = useState({ language: "Arabic", goal: "بناء الثقة والوعي", dialect: "العربية السعودية", format: "single_image", note: "", styleExamples: "" });
  const [content, setContent] = useState(null);
  const [editableContent, setEditableContent] = useState({ hook: "", post: "", cta: "" });
  const [design, setDesign] = useState(null);
  const [canvaPrompt, setCanvaPrompt] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [customLogo, setCustomLogo] = useState("");
  const [palette, setPalette] = useState(["#0E3A31", "#168164", "#D7C196", "#F5F1E8"]);
  const [fontPreference, setFontPreference] = useState("auto");
  const [fontSearch, setFontSearch] = useState("");
  const [fontCatalog, setFontCatalog] = useState(GOOGLE_FONTS);
  const [fontCatalogSource, setFontCatalogSource] = useState("loading");
  const [embeddedLogo, setEmbeddedLogo] = useState("");
  const [embeddedFontCss, setEmbeddedFontCss] = useState("");
  const [fontEmbedding, setFontEmbedding] = useState(false);
  const [previewPngs, setPreviewPngs] = useState([]);
  const [previewRendering, setPreviewRendering] = useState(false);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((data) => setApiStatus({ loading: false, ...data })).catch(() => setApiStatus({ loading: false, configured: false, model: "" }));
    fetch("/api/fonts").then((r) => r.json()).then((data) => {
      if (data.fonts?.length) setFontCatalog(data.fonts);
      setFontCatalogSource(data.source || "curated_fallback");
    }).catch(() => setFontCatalogSource("curated_fallback"));
  }, []);

  const logo = customLogo || source?.logoUrl || defaultBrand;
  const visualPalette = design?.palette?.length >= 3 ? design.palette : palette;
  const previewFont = fontPreference === "auto" ? (design?.typography?.fontFamily || "Cairo") : fontPreference;
  const filteredFonts = useMemo(() => fontCatalog.filter((font) => `${font.family} ${font.mood || ""} ${font.category || ""} ${(font.scripts || []).join(" ")}`.toLowerCase().includes(fontSearch.trim().toLowerCase())).slice(0, 120), [fontCatalog, fontSearch]);
  const hasExactFontMatch = fontCatalog.some((font) => font.family.toLowerCase() === fontSearch.trim().toLowerCase());
  const captionText = content ? `${editableContent.hook}\n\n${editableContent.post}\n\n${editableContent.cta}` : "";
  const hashtagText = content?.hashtags?.join(" ") || "";

  useEffect(() => {
    let active = true;
    imageDataUrl(logo).then((value) => { if (active) setEmbeddedLogo(value); });
    return () => { active = false; };
  }, [logo]);

  useEffect(() => {
    const id = "active-google-font";
    let link = document.getElementById(id);
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = googleFontCssUrl(previewFont);
  }, [previewFont]);

  async function analyze() {
    setError("");
    if (!url.trim()) return setError("ضع رابط موقع الشركة أولاً.");
    setRuns((r) => ({ ...r, analyst: "running" }));
    try {
      const data = await api("/api/agents/analyze", { url, context, contentLanguage: brief.language });
      setProfile(data.result); setSource(data.source);
      if (data.source.palette?.length >= 2) setPalette([...data.source.palette, "#F5F1E8"].slice(0, 5));
      setRuns((r) => ({ ...r, analyst: "done" }));
    } catch (e) { setRuns((r) => ({ ...r, analyst: "error" })); setError(e.message); }
  }

  async function write(angleOverride) {
    setError(""); setRuns((r) => ({ ...r, writer: "running" }));
    try {
      const effectiveBrief = angleOverride ? { ...brief, note: `اكتب حول هذه الزاوية تحديدًا: ${angleOverride}` } : brief;
      const data = await api("/api/agents/write", { brandProfile: profile, brief: effectiveBrief });
      setContent(data.result);
      setEditableContent({ hook: data.result.hook, post: data.result.post, cta: data.result.cta });
      setRuns((r) => ({ ...r, writer: "done" }));
    } catch (e) { setRuns((r) => ({ ...r, writer: "error" })); setError(e.message); }
  }

  function useAlternativeAngle(angleText) {
    write(angleText);
  }

  function designPost() {
    setError(""); setRuns((r) => ({ ...r, designer: "running" }));
    const isCarousel = content?.recommendedFormat === "carousel";
    const format = isCarousel ? "carousel" : "single LinkedIn post";
    const direction = brief.language === "Arabic" ? "right-to-left Arabic layout" : "left-to-right English layout";
    const chosenFont = fontPreference === "auto" ? "Baloo Bhaijaan 2" : fontPreference;
    const rawPages = isCarousel ? (content.carouselSlides || []) : [{
      headline: content?.designCopy?.headline || limitWords(content?.hook || "", 8),
      body: content?.designCopy?.body || limitWords(content?.post || "", 25),
      category: content?.designCopy?.category || "فكرة أساسية",
      slideType: content?.designCopy?.slideType || "standard"
    }];
    const normalizedPages = rawPages.map((slide, index) => {
      const slideType = inferSlideType(slide, index, rawPages.length);
      return {
        headline: limitWords(slide.headline, 8), body: limitWords(slide.body, 25),
        category: limitWords(slide.category || CATEGORY_BY_TYPE[slideType] || "فكرة أساسية", 2), slideType
      };
    });
    const promptPages = assignMotifs(normalizedPages);
    const contentBlock = promptPages.map((slide) => `PAGE ${slide.pageNumber} — MOTIF ${slide.motif} — ${slide.slideType.toUpperCase()}
Motif lock: ${PWP_MOTIFS[slide.motif]}
Headline: ${slide.headline}
Body: ${slide.body}
Footer category: ${slide.category}
Footer page number: ${slide.pageNumber}`).join("\n\n");
    const prompt = `You are a senior Canva designer applying the approved Post With Passion carousel design system. Create a polished ${format} for ${profile?.companyName || "the company"}.

Canvas: 1080 × 1080 px per page.
Language and direction: ${brief.language}; ${direction}.
Brand colors: ${palette.join(", ")}.
Typography: Use ${chosenFont}. Headline 64–72 px, bold, line-height 1.15. Body 32–36 px, regular, line-height 1.5. Footer and labels 22–26 px, medium, line-height 1.3.
Grid: Maintain 90 px safe margins. Place the logo at the top right, approximately 40 px high and 60 px from the top and right, without changing its proportions. Headline begins around 30% of canvas height and uses no more than 70% width. Keep at least 250 px whitespace between headline and body. Body begins around 65% height and uses no more than 65% width. Add a one-pixel footer divider around 90% height. Below it, put the two-digit page number on the left and category on the right.
Color rules: One solid background per page. No gradients. Use light text on dark backgrounds and the darkest palette color on light backgrounds. Use the beige/gold background on no more than one carousel page.

APPROVED PAGE SPECIFICATIONS:
${contentBlock}

STRICT RULES: Use exactly the assigned motif on each page and only its listed visual elements. Never add icons, chat bubbles, illustrations, extra circles, extra lines, gradients, or decorative shapes. Never show the labels “Headline”, “Body”, “Footer”, “Motif”, or “Slide type”. Do not change approved copy or invent claims. Do not shrink type to fit more text. Keep one idea per page. Never repeat the same motif on consecutive pages. Make all elements editable in Canva.${isCarousel ? " Keep all pages visibly related through typography, footer, logo, spacing, and palette." : " Deliver one focused square composition."}`;
    const localPages = promptPages.map((pageData) => ({ ...pageData, footer: pageData.category }));
    if (isCarousel) {
      setDesign({ format: "carousel", concept: "PWP Motif System — A–H", imageDirection: "Pixel-stable local preview based on the approved design system.", palette, typography: { fontFamily: chosenFont }, slides: localPages });
    } else {
      const pageData = localPages[0];
      setDesign({ format: "single_image", concept: `PWP Motif ${pageData.motif}`, imageDirection: "Pixel-stable local preview based on the approved design system.", palette, typography: { fontFamily: chosenFont }, slides: [], ...pageData });
    }
    setCanvaPrompt(prompt);
    setRuns((r) => ({ ...r, designer: "done" }));
  }

  function uploadLogo(event) {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setCustomLogo(reader.result);
      reader.readAsDataURL(file);
    }
  }

  function restart() {
    setStage(1); setRuns(initialRuns); setProfile(null); setContent(null); setDesign(null); setCanvaPrompt(""); setError("");
    setEditableContent({ hook: "", post: "", cta: "" });
    setBrief({ language: "Arabic", goal: "بناء الثقة والوعي", dialect: "العربية السعودية", format: "single_image", note: "", styleExamples: "" });
  }

  async function openCanvaWithPrompt() {
    if (!canvaPrompt) return;
    await copyValue(canvaPrompt, "تم نسخ برومبت Canva");
    window.open("https://www.canva.com/ai/", "_blank", "noopener,noreferrer");
  }

  async function copyValue(value, message) {
    if (value) await navigator.clipboard.writeText(value);
    setNotice(message); setTimeout(() => setNotice(""), 1800);
  }

  async function downloadDesign() {
    if (!design) return;
    previewSvgs.forEach((svg, index) => {
      downloadBlob(svg, `${profile?.companyName || "linkedin"}-design-${index + 1}.svg`);
    });
    setNotice(design.format === "carousel" ? "تم تحميل صفحات الكاروسيل" : "تم تحميل التصميم");
    setTimeout(() => setNotice(""), 1800);
  }

  async function downloadDesignPng() {
    if (!design) return;
    const pages = design.format === "carousel" ? slides : [{ headline: design.headline, body: design.body, footer: design.footer }];
    for (let index = 0; index < pages.length; index += 1) {
      let png;
      try { png = await rasterizeSvg(previewSvgs[index]); }
      catch { png = await makeDesignPngBlob({ ...pages[index], palette: visualPalette, font: previewFont, logo: embeddedLogo, page: index + 1 }); }
      downloadBlob(png, `${profile?.companyName || "linkedin"}-design-${index + 1}.png`, "image/png");
    }
    setNotice(design.format === "carousel" ? "تم تحميل صفحات الكاروسيل PNG" : "تم تحميل التصميم PNG");
    setTimeout(() => setNotice(""), 1800);
  }

  function openInCanva() {
    if (!design || !previewSvgs.length) return;
    const canvaTab = window.open("https://www.canva.com/create/instagram-posts/", "_blank", "noopener,noreferrer");
    previewSvgs.forEach((svg, index) => {
      downloadBlob(svg, `${profile?.companyName || "linkedin"}-canva-${index + 1}.svg`);
    });
    if (!canvaTab) setError("المتصفح منع فتح Canva. اسمح بالنوافذ المنبثقة ثم جرّب مجددًا.");
    setNotice(design.format === "carousel" ? "تم تنزيل صفحات SVG — ارفعها داخل Canva" : "تم تنزيل SVG — ارفعه داخل Canva");
    setTimeout(() => setNotice(""), 3200);
  }

  const agentActive = runs.designer === "running" || stage === 3 ? 3 : runs.writer === "running" || stage === 2 || stage === 4 ? 2 : 1;
  const slides = useMemo(() => design?.slides?.length ? design.slides : content?.carouselSlides || [], [design, content]);
  const designPages = useMemo(() => design?.format === "carousel" ? slides : design ? [{ headline: design.headline, body: design.body, footer: design.footer, category: design.category, motif: design.motif, pageNumber: design.pageNumber }] : [], [design, slides]);
  const designText = useMemo(() => designPages.map((page) => `${page.headline || ""} ${page.body || ""} ${page.footer || ""} ${page.category || ""}`).join(" ").trim(), [designPages]);

  useEffect(() => {
    let active = true;
    if (!designText) { setEmbeddedFontCss(""); setFontEmbedding(false); return () => { active = false; }; }
    setEmbeddedFontCss(""); setFontEmbedding(true);
    embedGoogleFontCss(previewFont, designText).then((css) => { if (active) setEmbeddedFontCss(css); }).catch((fontError) => { if (active) setError(fontError.message); }).finally(() => { if (active) setFontEmbedding(false); });
    return () => { active = false; };
  }, [previewFont, designText]);

  const previewSvgs = useMemo(() => designPages.map((page, index) => makeDesignSvg({ ...page, palette: visualPalette, font: previewFont, fontCss: embeddedFontCss, logo: embeddedLogo, page: index + 1 })), [designPages, visualPalette, previewFont, embeddedFontCss, embeddedLogo]);

  useEffect(() => {
    let active = true;
    if (!design || !embeddedFontCss || fontEmbedding || !previewSvgs.length) {
      setPreviewPngs([]); setPreviewRendering(Boolean(design));
      return () => { active = false; };
    }
    setPreviewRendering(true);
    Promise.all(previewSvgs.map(async (svg) => blobDataUrl(await rasterizeSvg(svg))))
      .then((images) => { if (active) setPreviewPngs(images); })
      .catch((previewError) => { if (active) setError(`تعذّر إنشاء المعاينة: ${previewError.message}`); })
      .finally(() => { if (active) setPreviewRendering(false); });
    return () => { active = false; };
  }, [design, embeddedFontCss, fontEmbedding, previewSvgs]);

  return <div className="orchestrator" dir="rtl" data-font-count={fontCatalog.length} data-font-source={fontCatalogSource}>
    <header className="app-header">
      <div className="product-mark"><span><Sparkle weight="fill" /></span><div><b>ثلاثة</b><small>استوديو محتوى بالذكاء الاصطناعي</small></div></div>
      <div className="header-meta"><span className={apiStatus.configured ? "connected" : "offline"}>{apiStatus.configured ? `OpenAI · ${apiStatus.model}` : "OpenAI غير متصل"}</span><button onClick={restart}>مشروع جديد</button></div>
    </header>

    <main>
      <section className="intro">
        <div><span>من الشركة إلى منشور جاهز</span><h1>ثلاثة وكلاء. نتيجة واحدة متماسكة.</h1><p>كل وكيل ينجز مهمة واحدة، ويسلّم نتيجة منظّمة للوكيل التالي.</p></div>
        <div className="privacy"><ShieldCheck size={20} /><span><b>لا ادعاءات مخترعة</b><small>المحتوى يعتمد على معلومات الشركة المعتمدة فقط.</small></span></div>
      </section>

      {!apiStatus.loading && !apiStatus.configured && <section className="api-warning"><WarningCircle size={22} /><div><b>أضف مفتاح OpenAI لتشغيل الوكلاء الحقيقيين</b><p>أنشئ ملف <code>.env.local</code> داخل المشروع وأضف <code>OPENAI_API_KEY=...</code>، ثم أعد تشغيل التطبيق. المفتاح يبقى على الخادم ولا يصل إلى المتصفح.</p></div></section>}

      <section className="agents-row">
        <AgentCard number="1" title="محلل الشركة" role="يقرأ الموقع ويبني ذاكرة موثّقة" icon={Globe} status={runs.analyst} active={agentActive === 1} />
        <ArrowLeft className="agent-arrow" size={21} />
        <AgentCard number="2" title="كاتب المحتوى" role="يختار الزاوية ويكتب بصوت العلامة" icon={PencilSimple} status={runs.writer} active={agentActive === 2} />
        <ArrowLeft className="agent-arrow" size={21} />
        <AgentCard number="3" title="محرك التصميم" role="يقسم المحتوى، يطبّق الموتيف، ويجهّز Canva" icon={Palette} status={runs.designer} active={agentActive === 3} />
      </section>

      {error && <div className="error-banner"><WarningCircle size={18} />{error}<button onClick={() => setError("")}>×</button></div>}

      {stage === 1 && <section className="stage-grid">
        <div className="work-panel">
          <div className="stage-title"><span>01</span><div><h2>دع الوكيل يفهم الشركة أولاً</h2><p>سيقرأ الموقع، يستخرج الخدمات والجمهور وصوت العلامة، ويفصل الحقائق عن التخمين.</p></div></div>
          <label>لغة المحتوى</label>
          <div className="language-picker">
            <button className={brief.language === "Arabic" ? "selected" : ""} onClick={() => setBrief({ ...brief, language: "Arabic", dialect: "العربية السعودية" })}><b>العربية</b><small>محتوى عربي بلهجة تختارها</small></button>
            <button className={brief.language === "English" ? "selected" : ""} onClick={() => setBrief({ ...brief, language: "English", dialect: "English" })}><b>English</b><small>English LinkedIn content</small></button>
          </div>
          <label>رابط موقع الشركة</label>
          <div className="url-input"><Globe size={18} /><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://company.com" type="url" /><button onClick={analyze} disabled={runs.analyst === "running" || !apiStatus.configured}>{runs.analyst === "running" ? <><i /> يحلل الموقع...</> : <>تحليل الشركة <ArrowLeft /></>}</button></div>
          <label>معلومة إضافية <em>اختياري</em></label>
          <textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="مثلاً: نستهدف الشركات الصغيرة في السعودية، ونريد لهجة مهنية وقريبة..." />
          <div className="analysis-note"><Brain size={18} /><span><b>ما الذي سيفعله AI 1؟</b> يقرأ النصوص الظاهرة، يلتقط إشارات الهوية، ويضع أي معلومة غير مؤكدة ضمن «نواقص» بدلاً من اختراعها.</span></div>
        </div>
        <div className="result-panel">
          {!profile ? <EmptyAgent icon={Globe} title="ملف الشركة سيظهر هنا" text="أدخل رابطاً وشغّل المحلل. لن ينتقل أي شيء للكاتب قبل موافقتك." /> : <>
            <div className="result-head"><div><span>تحليل AI 1</span><h2>{profile.companyName}</h2><p>{profile.summary}</p></div><strong>{profile.confidence}%<small>ثقة التحليل</small></strong></div>
            <div className="fact-groups">
              <div><b>الخدمات</b>{profile.services.map((x) => <span key={x}><Check />{x}</span>)}</div>
              <div><b>الجمهور</b>{profile.audiences.map((x) => <span key={x}><Check />{x}</span>)}</div>
              <div><b>صوت العلامة</b><p>{profile.voice.language} · {profile.voice.dialect}</p><p>{profile.voice.traits.join("، ")}</p></div>
              {profile.unknowns.length > 0 && <div className="unknowns"><b>معلومات ناقصة</b>{profile.unknowns.map((x) => <span key={x}><WarningCircle />{x}</span>)}</div>}
            </div>
            <button className="approve" onClick={() => setStage(2)}><Check weight="bold" /> اعتماد ملف الشركة وتسليمه للكاتب</button>
          </>}
        </div>
      </section>}

      {stage === 2 && <section className="stage-grid">
        <div className="work-panel">
          <button className="back" onClick={() => setStage(1)}><ArrowRight /> ملف الشركة</button>
          <div className="stage-title"><span>02</span><div><h2>الكاتب يختار الزاوية</h2><p>أعطه الهدف فقط. يستطيع اقتراح الموضوع من ركائز الشركة أو استخدام ملاحظتك.</p></div></div>
          <div className="two-fields"><div><label>هدف المنشور</label><select value={brief.goal} onChange={(e) => setBrief({ ...brief, goal: e.target.value })}><option>بناء الثقة والوعي</option><option>جذب عملاء محتملين</option><option>شرح خدمة</option><option>قيادة فكرية</option></select></div><div><label>{brief.language === "Arabic" ? "اللهجة" : "Content language"}</label><select value={brief.dialect} onChange={(e) => setBrief({ ...brief, dialect: e.target.value })}>{brief.language === "Arabic" ? <><option>العربية السعودية</option><option>العربية الفصحى</option></> : <option>English</option>}</select></div></div>
          <label>شكل المنشور</label>
          <div className="format-picker">
            <button className={brief.format === "text_only" ? "selected" : ""} onClick={() => setBrief({ ...brief, format: "text_only" })}><PencilSimple weight="duotone" /><span><b>نص فقط</b><small>منشور بدون تصميم</small></span></button>
            <button className={brief.format === "single_image" ? "selected" : ""} onClick={() => setBrief({ ...brief, format: "single_image" })}><ImageSquare weight="duotone" /><span><b>منشور واحد</b><small>تصميم واحد برسالة مركّزة</small></span></button>
            <button className={brief.format === "carousel" ? "selected" : ""} onClick={() => setBrief({ ...brief, format: "carousel" })}><span className="carousel-symbol">▣</span><span><b>كاروسيل</b><small>من 4 إلى 7 صفحات</small></span></button>
          </div>
          <label>أمثلة أسلوبك <em>اختياري — الصق منشورًا أو اثنين تحبهم</em></label>
          <textarea value={brief.styleExamples} onChange={(e) => setBrief({ ...brief, styleExamples: e.target.value })} placeholder="الصق منشورًا فعليًا نشرته من قبل وعجبك أسلوبه، وAI بيحاكي إيقاعه بدل الاعتماد على تخمين عام..." />
          <label>توجيه إضافي <em>اختياري — اتركه فارغاً ليختار AI الموضوع</em></label>
          <textarea value={brief.note} onChange={(e) => setBrief({ ...brief, note: e.target.value })} placeholder="مثلاً: اربط الموضوع بتحديات التوسع..." />
          <button className="run-agent" onClick={() => write()} disabled={runs.writer === "running"}>{runs.writer === "running" ? <><i /> الكاتب يعمل...</> : <><MagicWand weight="fill" /> دع الكاتب يختار ويكتب</>}</button>
        </div>
        <div className="result-panel content-result">
          {!content ? <EmptyAgent icon={PencilSimple} title="الكاتب بانتظار الإشارة" text="سيختار زاوية غير عامة ويستخدم الحقائق المعتمدة من ملف الشركة." /> : <>
            <div className="content-top"><span>الزاوية التي اختارها AI</span><h2>{content.angle}</h2><button onClick={() => copyValue(captionText, "تم نسخ الكابشن")}><Copy /> نسخ الكابشن</button></div>
            {content.alternativeAngles?.length > 0 && <div className="alt-angles"><b>زوايا بديلة</b>{content.alternativeAngles.map((angle) => <button key={angle} onClick={() => useAlternativeAngle(angle)} disabled={runs.writer === "running"}>{angle}<span>جرّب هذي</span></button>)}</div>}
            <label className="editable-label">الخطاف <em>قابل للتعديل</em></label>
            <textarea className="editable-copy hook" value={editableContent.hook} onChange={(e) => setEditableContent({ ...editableContent, hook: e.target.value })} />
            <label className="editable-label">النص <em>قابل للتعديل</em></label>
            <textarea className="editable-copy post" value={editableContent.post} onChange={(e) => setEditableContent({ ...editableContent, post: e.target.value })} />
            <label className="editable-label">الدعوة للفعل <em>قابل للتعديل</em></label>
            <textarea className="editable-copy cta" value={editableContent.cta} onChange={(e) => setEditableContent({ ...editableContent, cta: e.target.value })} />
            <div className="hashtags">{content.hashtags.map((x) => <span key={x}>{x}</span>)}</div>
            <div className="audit"><ShieldCheck /><span><b>الحقائق المستخدمة</b>{content.factsUsed.join(" · ") || "لا توجد ادعاءات رقمية"}</span></div>
            {content.recommendedFormat === "text_only"
              ? <button className="approve" onClick={() => setStage(4)}><Check weight="bold" /> المنشور جاهز للنشر</button>
              : <button className="approve" onClick={() => setStage(3)}><Check weight="bold" /> اعتماد النص وتسليمه للمصمم</button>}
          </>}
        </div>
      </section>}

      {stage === 3 && <section className="stage-grid design-stage">
        <div className="work-panel">
          <button className="back" onClick={() => setStage(2)}><ArrowRight /> المحتوى</button>
          <div className="stage-title"><span>03</span><div><h2>ولّد التصميم بنظام PWP</h2><p>معاينة ثابتة بالموتيف H وبرومبت Canva منضبط بمكتبة الموتيفات المعتمدة.</p></div></div>
          <label>اللوغو</label><label className="logo-control"><input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={uploadLogo} /><img src={logo} alt="اللوغو" /><span><UploadSimple /> رفع أو تغيير اللوغو</span></label>
          <label>ألوان الهوية</label><div className="palette-control">{palette.map((color, i) => <label key={`${color}-${i}`}><input type="color" value={color} onChange={(e) => setPalette(palette.map((c, n) => n === i ? e.target.value : c))} /><span style={{ background: color }} /></label>)}</div>
          <label>خط Google Fonts</label>
          <div className="font-control">
            <div className="font-search"><MagnifyingGlass /><input value={fontSearch} onChange={(e) => setFontSearch(e.target.value)} placeholder="ابحث في جميع خطوط Google Fonts..." /></div>
            <div className="font-catalog-meta"><span>{fontCatalogSource === "loading" ? "يتم تحميل مكتبة الخطوط..." : `${fontCatalog.length.toLocaleString()} خط متاح`}</span><small>يتم تحميل الخط المختار فقط للحفاظ على السرعة</small></div>
            <div className="font-options">
              <button className={fontPreference === "auto" ? "selected" : ""} onClick={() => setFontPreference("auto")}><b>نظام PWP</b><small>Baloo Bhaijaan 2</small></button>
              {fontSearch.trim() && !hasExactFontMatch && <button className="custom-font" onClick={() => setFontPreference(fontSearch.trim())}><b>استخدام “{fontSearch.trim()}”</b><small>استخدم الاسم مباشرة من Google Fonts</small></button>}
              {filteredFonts.map((font) => <button key={font.family} className={fontPreference === font.family ? "selected" : ""} onClick={() => setFontPreference(font.family)} style={{ fontFamily: `'${font.family}', sans-serif` }}><b>{font.family}</b><small>{(font.scripts || []).some((script) => script.toLowerCase() === "arabic") ? "يدعم العربية" : font.category || "Google Font"}</small></button>)}
              {filteredFonts.length === 0 && !fontSearch.trim() && <p>تعذّر تحميل المكتبة الكاملة. يمكنك كتابة اسم أي خط واستخدامه مباشرة.</p>}
            </div>
            <div className="font-preview" style={{ fontFamily: `'${previewFont}', sans-serif` }}><span>{previewFont}</span><b>فكرة واضحة، بتصميم يليق بعلامتك.</b></div>
          </div>
          <button className="run-agent" onClick={designPost} disabled={!content}><ImageSquare weight="fill" /> إنشاء المعاينة وبرومبت Canva</button>
        </div>
        <div className="result-panel design-result">
          {!canvaPrompt ? <EmptyAgent icon={Palette} title="التصميم سيظهر هنا" text="اضبط الهوية والخط، ثم أنشئ معاينة الموتيف H وبرومبت Canva." /> : <>
            <div className="design-meta"><div><span>نظام الموتيفات · A–H</span><h2>معاينة حقيقية لكل صفحة بموتيفها الفعلي</h2><p>كل صفحة تترسم محليًا بنفس الموتيف المعتمد لها — مو معاينة عامة تُستبدل لاحقًا داخل Canva.</p></div><b>{content?.recommendedFormat === "carousel" ? `${content.carouselSlides?.length || 0} صفحات` : "صورة واحدة"} · 1080 × 1080</b></div>
            {previewRendering || !previewPngs.length ? <div className="preview-loading"><i /> جاري تجهيز معاينة PWP المطابقة للتنزيل...</div> : design?.format === "carousel" ? <div className="slides-preview canonical-slides">{previewPngs.map((src, i) => <article key={`pwp-preview-${i}`}><img src={src} alt={`معاينة الصفحة ${i + 1}`} /></article>)}</div> : <div className="canonical-preview"><img src={previewPngs[0]} alt="معاينة التصميم" /></div>}
            <div className="design-actions phase-one-actions"><button onClick={downloadDesign} disabled={fontEmbedding || !embeddedFontCss || previewRendering}><DownloadSimple weight="bold" /> SVG</button><button className="approve" onClick={downloadDesignPng} disabled={fontEmbedding || !embeddedFontCss || previewRendering}><DownloadSimple weight="bold" /> تحميل PNG</button></div>
            <article className="canva-prompt-card"><div><span>برومبت التصميم</span><button onClick={() => copyValue(canvaPrompt, "تم نسخ برومبت Canva")}><Copy /> نسخ</button></div><pre>{canvaPrompt}</pre></article>
            <div className="delivery-grid">
              <article><div><span>كابشن المنشور</span><button onClick={() => copyValue(captionText, "تم نسخ الكابشن")}><Copy /> نسخ</button></div><p>{captionText}</p></article>
              <article><div><span>الهاشتاغات المقترحة</span><button onClick={() => copyValue(hashtagText, "تم نسخ الهاشتاغات")}><Copy /> نسخ</button></div><p className="delivery-hashtags">{hashtagText}</p></article>
            </div>
            <div className="canva-handoff"><b>الخطوة التالية</b><span>انسخ البرومبت، افتح Canva AI، الصقه، ثم ارفع اللوغو واختر النتيجة الأفضل.</span></div>
            <div className="design-actions"><button onClick={() => setStage(2)}><PencilSimple /> تعديل المحتوى</button><button className="canva-action" onClick={openCanvaWithPrompt}><span className="canva-mark">C</span> نسخ وفتح Canva</button></div>
          </>}
        </div>
      </section>}

      {stage === 4 && <section className="stage-grid">
        <div className="work-panel">
          <button className="back" onClick={() => setStage(2)}><ArrowRight /> المحتوى</button>
          <div className="stage-title"><span>04</span><div><h2>منشور نصي — بدون تصميم</h2><p>اخترت «نص فقط»، فمحرك التصميم مو مطلوب لهذا المنشور. انسخ وانشر مباشرة.</p></div></div>
          <div className="analysis-note"><ShieldCheck size={18} /><span>ما تحتاج للمصمم؟ اضغط «تعديل المحتوى» وغيّر الشكل إلى «منشور واحد» أو «كاروسيل» أي وقت.</span></div>
        </div>
        <div className="result-panel">
          <div className="content-top"><span>جاهز للنشر</span><h2>{content?.angle}</h2><button onClick={() => copyValue(captionText, "تم نسخ الكابشن")}><Copy /> نسخ الكابشن</button></div>
          <p className="post-copy" style={{ whiteSpace: "pre-line" }}>{captionText}</p>
          <div className="hashtags">{content?.hashtags?.map((x) => <span key={x}>{x}</span>)}</div>
        </div>
      </section>}
    </main>
    {notice && <div className="toast">{notice}<Check /></div>}
  </div>;
}
