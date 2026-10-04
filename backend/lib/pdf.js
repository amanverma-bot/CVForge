// PDF generation: Puppeteer (pretty HTML) when available, else pdfkit (Termux-safe)
async function makePDF(title, text) {
  // Try puppeteer first
  try {
    const puppeteer = require("puppeteer");
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const body = esc(text).split("\n").map((l) => (l.trim() ? `<p>${l}</p>` : "<br>")).join("");
    await page.setContent(`<html><body style="font-family:sans-serif;padding:32px"><h1>${esc(title)}</h1>${body}</body></html>`);
    const buf = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();
    return { buffer: buf, mime: "application/pdf", ext: ".pdf", engine: "puppeteer" };
  } catch { /* fall through to pdfkit */ }
  const PDFDocument = require("pdfkit");
  const chunks = [];
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const done = new Promise((resolve) => { doc.on("data", (c) => chunks.push(c)); doc.on("end", resolve); });
  doc.fontSize(18).text(title, { underline: true });
  doc.moveDown();
  doc.fontSize(10).text(text || "", { lineGap: 2 });
  doc.end();
  await done;
  return { buffer: Buffer.concat(chunks), mime: "application/pdf", ext: ".pdf", engine: "pdfkit" };
}
module.exports = { makePDF };
