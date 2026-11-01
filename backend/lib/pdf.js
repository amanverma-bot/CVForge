// ── PDF Generator ──────────────────────────────────────────────────────────
// Generates a professional PDF from text content using a pure-JS approach.
// Falls back gracefully if Puppeteer is unavailable.
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

async function makePDF(title, text) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = height - margin;
  const lineHeight = 18;

  // Title
  page.drawText(title, {
    x: margin,
    y,
    size: 22,
    font: boldFont,
    color: rgb(0.12, 0.23, 0.37), // navy
  });
  y -= lineHeight * 1.5;

  // Horizontal rule
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.12, 0.23, 0.37),
  });
  y -= lineHeight;

  // Body text
  const lines = text.split("\n");
  for (const line of lines) {
    if (y < margin + 40) {
      const newPage = pdfDoc.addPage([595.28, 841.89]);
      const { height: h2 } = newPage.getSize();
      y = h2 - margin;
    }
    const isHeading = line === line.toUpperCase() && line.length < 50 && line.length > 0;
    page.drawText(line, {
      x: margin,
      y,
      size: isHeading ? 12 : 10,
      font: isHeading ? boldFont : font,
      color: isHeading ? rgb(0.12, 0.23, 0.37) : rgb(0.2, 0.2, 0.2),
    });
    y -= lineHeight;
  }

  const pdfBytes = await pdfDoc.save();
  return {
    buffer: Buffer.from(pdfBytes),
    mime: "application/pdf",
    engine: "pdf-lib",
  };
}

module.exports = { makePDF };