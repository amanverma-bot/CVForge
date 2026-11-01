// ── PDF/DOCX Parser service ─────────────────────────────
// Box: PDF/DOCX Parser (diagram bottom). Used by REST API before scoring.
// Malformed/scanned files degrade into clean 422 AppErrors — never a 500 crash.
const { extractText } = require("../lib/parse");
const { AppError } = require("../middleware/error");

async function extractCVText(buffer, filename = "") {
  const label = filename || "file";
  let text = "";
  try {
    text = await extractText(buffer, filename);
  } catch (err) {
    // Let AppError (e.g., 415 for renamed files) pass through
    if (err.statusCode) throw err;
    throw new AppError(422, `Could not read "${label}" — use a text-based PDF, DOCX, TXT, MD (scanned/image PDFs are not supported)`);
  }
  if (!String(text || "").trim()) {
    throw new AppError(422, `No readable text found in "${label}" — is it a scanned/image PDF? Try pasting the text instead`);
  }
  return text;
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
  } catch {
    return "";
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (CVForge)" }, signal: ctrl.signal });
    clearTimeout(t);
    const ctype = resp.headers.get("content-type") || "";
    if (!/text|html/i.test(ctype)) return "";
    const html = (await resp.text()).slice(0, 300000);
    return html
      .replace(/<(script|style)[^>]*>.*?<\/\1>/gis, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
  } catch {
    return "";
  }
}

module.exports = { extractCVText, fetchJDFromURL };
