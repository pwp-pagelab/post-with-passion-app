export const GOOGLE_FONTS = [
  { family: "Cairo", scripts: ["Arabic", "Latin"], mood: "modern, clear, corporate" },
  { family: "Tajawal", scripts: ["Arabic", "Latin"], mood: "friendly, clean, approachable" },
  { family: "IBM Plex Sans Arabic", scripts: ["Arabic", "Latin"], mood: "technical, precise, professional" },
  { family: "Noto Kufi Arabic", scripts: ["Arabic", "Latin"], mood: "geometric, structured, bold" },
  { family: "Noto Sans Arabic", scripts: ["Arabic", "Latin"], mood: "neutral, readable, versatile" },
  { family: "Almarai", scripts: ["Arabic", "Latin"], mood: "compact, confident, contemporary" },
  { family: "Changa", scripts: ["Arabic", "Latin"], mood: "expressive, energetic, editorial" },
  { family: "El Messiri", scripts: ["Arabic", "Latin"], mood: "elegant, distinctive, premium" },
  { family: "Readex Pro", scripts: ["Arabic", "Latin"], mood: "digital, modern, highly readable" },
  { family: "Alexandria", scripts: ["Arabic", "Latin"], mood: "confident, contemporary, branded" },
  { family: "Reem Kufi", scripts: ["Arabic", "Latin"], mood: "cultural, geometric, refined" },
  { family: "Inter", scripts: ["Latin"], mood: "neutral, product-led, modern" },
  { family: "Manrope", scripts: ["Latin"], mood: "clean, premium, minimal" },
  { family: "DM Sans", scripts: ["Latin"], mood: "friendly, editorial, contemporary" },
  { family: "Space Grotesk", scripts: ["Latin"], mood: "distinctive, technical, modern" }
];

export const GOOGLE_FONT_FAMILIES = GOOGLE_FONTS.map((font) => font.family);

export function googleFontCssUrl(family, options = {}) {
  const encodedFamily = family.trim().replace(/\s+/g, "+");
  const weight = options.weight ? `:wght@${options.weight}` : "";
  const text = options.text ? `&text=${encodeURIComponent(options.text)}` : "";
  return `https://fonts.googleapis.com/css2?family=${encodedFamily}${weight}${text}&display=swap`;
}
