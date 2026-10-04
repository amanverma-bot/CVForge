// ── PDF/DOCX Parser service ─────────────────────────────
// Box: PDF/DOCX Parser (diagram bottom). Used by REST API before scoring.
const { extractText } = require("../lib/parse");

async function extractCVText(buffer, filename = "") {
  return extractText(buffer, filename);
}

// JD import from URL (LinkedIn/Naukri/generic) with SSRF guard + caps.
async function fetchJDFromURL(url, timeoutMs = 10000) {
  if (!url || !/^https?:\/\//i.test(url)) return "";
  try {
    const { hostname } = new URL(url);
    if (["localhost", "metadata.google.internal", "169.254.169.254"].includes(hostname.toLowerCase())) return "";
    const net = require("net");
    if (net.isIP(hostname)) {
      const parts = hostname.split(".").map(Number);
      if (parts.length === 4 && (parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || parts[0] === 169)) return "";
    }
  } catch { return ""; }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (CV-MERN)" }, signal: ctrl.signal });
    clearTimeout(t);
    const ctype = resp.headers.get("content-type") || "";
    if (!/text|html/i.test(ctype)) return "";
    const html = (await resp.text()).slice(0, 300000);
    return html.replace(/<(script|style)[^>]*>.*?<\/\1>/gis, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
  } catch { return ""; }
}

module.exports = { extractCVText, fetchJDFromURL };
