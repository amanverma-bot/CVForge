// CV text extraction: PDF (pdf-parse) + DOCX (mammoth) + TXT
async function extractText(buffer, filename = "") {
  const name = (filename || "").toLowerCase();
  if (name.endsWith(".pdf")) {
    const pdf = require("pdf-parse");
    const data = await pdf(buffer);
    return (data.text || "").slice(0, 50000);
  }
  if (name.endsWith(".docx")) {
    const mammoth = require("mammoth");
    const out = await mammoth.extractRawText({ buffer });
    return (out.value || "").slice(0, 50000);
  }
  return buffer.toString("utf-8").slice(0, 50000);
}
module.exports = { extractText };
