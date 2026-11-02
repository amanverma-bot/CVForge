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
// Every hop is validated; hostnames are resolved so DNS rebinding to private
// space and redirect chains to internal hosts are rejected.
const dns = require("dns").promises;
const net = require("net");

function isPrivateIp(addr) {
  if (net.isIPv4(addr)) {
    const p = addr.split(".").map(Number);
    return (
      p[0] === 0 ||
      p[0] === 10 ||
      p[0] === 127 ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 198 && (p[1] === 18 || p[1] === 19)) ||
      p[0] >= 224
    );
  }
  if (net.isIPv6(addr)) {
    const a = addr.toLowerCase();
    if (a === "::" || a === "::1") return true;
    if (/^fe[89ab]/.test(a)) return true; // fe80::/10 link-local
    if (/^f[cd]/.test(a)) return true; // fc00::/7 unique-local
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true;
}

async function validatePublicUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname) return null;
  if (u.username || u.password) return null;

  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal") return null;
  if (net.isIP(host)) return isPrivateIp(host) ? null : u;

  let addresses = [];
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return null;
  }
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) return null;
  return u;
}

function stripHtml(html) {
  return html
    .replace(/<(script|style)[^>]*>.*?<\/\1>/gis, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

const MAX_HTML_BYTES = 300000;
const MAX_REDIRECTS = 3;

async function fetchJDFromURL(url, timeoutMs = 10000) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safe = await validatePublicUrl(current);
    if (!safe) return "";

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(safe.href, {
        headers: { "User-Agent": "Mozilla/5.0 (CVForge)" },
        signal: ctrl.signal,
        redirect: "manual",
      });

      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get("location");
        if (!location) return "";
        current = new URL(location, safe).href;
        continue;
      }
      if (!resp.ok) return "";

      const ctype = resp.headers.get("content-type") || "";
      if (!/text|html/i.test(ctype)) return "";

      const reader = resp.body && resp.body.getReader ? resp.body.getReader() : null;
      if (!reader) return stripHtml((await resp.text()).slice(0, MAX_HTML_BYTES));

      const chunks = [];
      let received = 0;
      while (received < MAX_HTML_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
        received += value.length;
      }
      if (received >= MAX_HTML_BYTES) {
        try {
          await reader.cancel();
        } catch {
          /* stream may already be closed */
        }
      }
      return stripHtml(Buffer.concat(chunks).toString("utf8").slice(0, MAX_HTML_BYTES));
    } catch {
      return "";
    } finally {
      clearTimeout(timer);
    }
  }
  return "";
}

module.exports = { extractCVText, fetchJDFromURL };
