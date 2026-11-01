// ── PDF / DOCX / TXT / MD Parser ───────────────────────────────────────────
// Extracts text from uploaded buffers. Magic-byte verified before parsing.
const pdf = require("pdf-parse");
const mammoth = require("mammoth");

const { AppError } = require("../middleware/error");

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function getExtension(filename) {
  return filename.toLowerCase().includes(".")
    ? "." + filename.toLowerCase().split(".").pop()
    : "";
}

function isAllowedExtension(filename) {
  return ALLOWED_EXTENSIONS.includes(getExtension(filename));
}

function checkMagicBytes(buffer, filename) {
  const ext = getExtension(filename);
  const header = buffer.slice(0, 8);
  const hex = header.toString("hex").toUpperCase();

  switch (ext) {
    case ".pdf":
      return header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46; // %PDF
    case ".docx":
      return header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04; // PK\x03\x04 (ZIP)
    case ".txt":
    case ".md":
      return true; // text files - no magic byte check
    default:
      return false;
  }
}

async function extractText(buffer, filename = "") {
  const ext = getExtension(filename);

  if (!isAllowedExtension(filename)) {
    throw new Error(`Unsupported file type: ${ext}. Use PDF, DOCX, TXT, or MD.`);
  }

  if (!checkMagicBytes(buffer, filename)) {
    throw new AppError(415, `File "${filename}" content does not match its extension — possible renamed file.`);
  }

  switch (ext) {
    case ".pdf": {
      const data = await pdf(buffer);
      return data.text || "";
    }
    case ".docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || "";
    }
    case ".txt":
    case ".md": {
      return buffer.toString("utf-8");
    }
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

// JD import from URL with SSRF guard
async function fetchJDFromURL(url, timeoutMs = 10000) {
  if (!url || !/^https?:\/\//i.test(url)) return "";
  try {
    const { hostname } = new URL(url);
    const lower = hostname.toLowerCase();
    if (
      ["localhost", "metadata.google.internal", "169.254.169.254"].includes(lower)
    ) return "";
    const net = require("net");
    if (net.isIP(hostname)) {
      const parts = hostname.split(".").map(Number);
      if (
        parts.length === 4 &&
        (parts[0] === 10 ||
          parts[0] === 127 ||
          (parts[0] === 192 && parts[1] === 168) ||
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
          parts[0] === 169)
      )
        return "";
    }
  } catch {
    return "";
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const resp = await fetch(url, {
      headers: { "User-Agent": "CVForge/1.0" },
      signal: ctrl.signal,
    });
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

module.exports = { extractText, extractCVText: extractText, fetchJDFromURL, isAllowedExtension, MAX_FILE_SIZE };