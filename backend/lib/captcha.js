// ── Math Captcha ───────────────────────────────────────────────────────────
// One-time math captcha for registration. Tokens stored in memory with 5-min TTL.
const captchas = new Map();

function issueCaptcha() {
  const a = Math.floor(Math.random() * 12) + 2;
  const b = Math.floor(Math.random() * 12) + 2;
  const token = Math.random().toString(36).slice(2, 14);
  const expiresAt = Date.now() + 5 * 60 * 1000;
  captchas.set(token, { answer: a + b, expiresAt });
  // Cleanup expired entries
  if (captchas.size > 1000) {
    const now = Date.now();
    for (const [k, v] of captchas.entries()) {
      if (v.expiresAt < now) captchas.delete(k);
    }
  }
  return { token, question: `What is ${a} + ${b}?` };
}

function consumeCaptcha(token, answer) {
  if (!token || answer === undefined || answer === null) return false;
  const entry = captchas.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    captchas.delete(token);
    return false;
  }
  captchas.delete(token); // single-use
  return Number(answer) === entry.answer;
}

module.exports = { issueCaptcha, consumeCaptcha };