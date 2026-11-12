// OAuth integration tests with mocked provider HTTP responses.
// These verify state/PKCE, cookie handling, account linking, and error paths
// without contacting Google or GitHub and without real credentials.
import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { addOrigin } = require("../middleware/security.js");

const api = request(app);
const uniq = () => Math.random().toString(36).slice(2, 9);

function allCookies(res) {
  const value = res.headers["set-cookie"];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function findCookie(res, name) {
  const prefix = `${name}=`;
  for (const header of allCookies(res)) {
    if (String(header).startsWith(prefix)) {
      return String(header).split(";")[0];
    }
  }
  return null;
}

function cookieHeader(res, name) {
  return findCookie(res, name);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function freshCaptcha() {
  const res = await api.get("/api/captcha");
  expect(res.status).toBe(200);
  return res.body;
}

function solve(question) {
  const [, a, b] = question.match(/(\d+)\s*\+\s*(\d+)/) || [0, 0, 0];
  return Number(a) + Number(b);
}

async function register(name, email) {
  const cap = await freshCaptcha();
  return api.post("/api/auth/register").send({
    name,
    email,
    password: "Passw0rd!123",
    confirm_password: "Passw0rd!123",
    captcha_token: cap.token,
    captcha_answer: solve(cap.question),
  });
}

async function begin(provider) {
  const res = await api.get(`/api/auth/${provider}`).set("X-Forwarded-Proto", "https");
  expect(res.status).toBe(302);
  const location = new URL(res.headers.location);
  const state = location.searchParams.get("state");
  expect(state).toBeTruthy();
  const cookieName = `cvforge_oauth_state_${provider}`;
  const cookie = cookieHeader(res, cookieName);
  expect(cookie).toBeTruthy();
  return { res, location, state, cookie, cookieName };
}

async function finish(provider, flow, query = {}) {
  const params = new URLSearchParams({ code: "test-code", state: flow.state, ...query });
  return api
    .get(`/api/auth/${provider}/callback?${params.toString()}`)
    .set("Cookie", flow.cookie)
    .set("X-Forwarded-Proto", "https");
}

function googleFetch(profile = {}, hooks = {}) {
  return vi.fn(async (url, options) => {
    const target = String(url);
    if (target.includes("oauth2.googleapis.com/token")) {
      if (hooks.onToken) hooks.onToken(String(options?.body || ""));
      return jsonResponse({ access_token: "google-access-token", token_type: "Bearer" });
    }
    if (target.includes("openidconnect.googleapis.com/v1/userinfo")) {
      return jsonResponse({
        sub: "google-sub-default",
        email: "google-default@example.com",
        email_verified: true,
        name: "Google Default",
        picture: "https://images.example.com/google.png",
        ...profile,
      });
    }
    throw new Error(`Unexpected Google fetch: ${target}`);
  });
}

function githubFetch({ user = {}, emails = [] } = {}) {
  return vi.fn(async (url, options) => {
    const target = String(url);
    if (target.includes("github.com/login/oauth/access_token")) {
      const body = String(options?.body || "");
      if (!body.includes("client_id=test-github-client-id")) throw new Error("missing client id");
      return jsonResponse({ access_token: "github-access-token", token_type: "bearer" });
    }
    if (target.includes("api.github.com/user/emails")) {
      return jsonResponse(emails);
    }
    if (target.includes("api.github.com/user")) {
      return jsonResponse({
        id: 424242,
        login: "octocat-test",
        name: "Octo Cat",
        email: null,
        avatar_url: "https://images.example.com/github.png",
        ...user,
      });
    }
    throw new Error(`Unexpected GitHub fetch: ${target}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OAuth start endpoints", () => {
  it("Google builds an authorization URL with state and PKCE, and sets a secure HttpOnly cookie", async () => {
    const { res, location, cookieName } = await begin("google");
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("client_id")).toBe("test-google-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe("https://api.test.local/api/auth/google/callback");
    expect(location.searchParams.get("scope")).toContain("openid");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    expect(location.searchParams.get("client_secret")).toBeNull();
    expect(res.headers["cache-control"]).toBe("no-store");

    const cookie = allCookies(res).find((value) => String(value).startsWith(`${cookieName}=`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Path=\/api\/auth/i);
  });

  it("GitHub starts without PKCE and never exposes the client secret", async () => {
    const { location } = await begin("github");
    expect(location.origin).toBe("https://github.com");
    expect(location.searchParams.get("client_id")).toBe("test-github-client-id");
    expect(location.searchParams.get("scope")).toBe("read:user user:email");
    expect(location.searchParams.get("code_challenge")).toBeNull();
    expect(location.searchParams.get("client_secret")).toBeNull();
  });

  it("reports provider configuration status without exposing credentials", async () => {
    const res = await api.get("/api/auth/providers");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.providers.google).toEqual({ label: "Google", configured: true });
    expect(res.body.providers.github).toEqual({ label: "GitHub", configured: true });
    expect(JSON.stringify(res.body)).not.toContain("test-google-client-secret");
    expect(JSON.stringify(res.body)).not.toContain("test-github-client-secret");
    expect(JSON.stringify(res.body)).not.toContain("test-google-client-id");
  });
});

describe("OAuth callback and session exchange", () => {
  it("sends the PKCE verifier only to the Google token endpoint", async () => {
    let tokenBody = "";
    vi.stubGlobal("fetch", googleFetch(
      { sub: "google-pkce", email: `pkce-${uniq()}@example.com` },
      { onToken: (body) => { tokenBody = body; } }
    ));
    const callback = await finish("google", await begin("google"));
    expect(callback.status).toBe(302);
    expect(tokenBody).toMatch(/code_verifier=[A-Za-z0-9_-]{40,}/);
    expect(tokenBody).toContain("grant_type=authorization_code");
  });

  it("Google login creates an account, sets a short-lived session cookie, and returns the existing JWT shape", async () => {
    vi.stubGlobal("fetch", googleFetch({ sub: "google-new", email: "new-google@example.com" }));
    const flow = await begin("google");
    const callback = await finish("google", flow);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe("https://app.test.local/login?oauth=success");
    expect(callback.headers["cache-control"]).toBe("no-store");
    const sessionCookie = cookieHeader(callback, "cvforge_oauth_session");
    expect(sessionCookie).toBeTruthy();
    const sessionHeader = allCookies(callback).find((value) => String(value).startsWith("cvforge_oauth_session="));
    expect(sessionHeader).toMatch(/HttpOnly/i);
    expect(sessionHeader).toMatch(/SameSite=Lax/i);
    expect(sessionHeader).toMatch(/Secure/i);

    const exchange = await api
      .post("/api/auth/oauth/session")
      .set("Cookie", sessionCookie)
      .set("Origin", "https://app.test.local")
      .set("X-Forwarded-Proto", "https");
    expect(exchange.status).toBe(200);
    expect(exchange.body.token).toBeTruthy();
    expect(exchange.body.user.email).toBe("new-google@example.com");
    expect(exchange.body.user.avatar).toContain("google.png");
    expect(exchange.body.user.username).toBe(exchange.body.user.name);
    expect(exchange.body.user.passwordHash).toBeUndefined();
    expect(exchange.body.user.googleId).toBeUndefined();
    expect(exchange.body.user.githubId).toBeUndefined();
    expect(sessionHeader).toMatch(/Max-Age=120/i);
    expect(callback.headers.location).not.toContain("access_token");

    const me = await api.get("/api/auth/me").set("Authorization", `Bearer ${exchange.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("new-google@example.com");

    // A second exchange without the session cookie must fail.
    expect((await api.post("/api/auth/oauth/session")).status).toBe(401);

    // OAuth-only accounts have no password hash and must not accept password login.
    const passwordAttempt = await api.post("/api/auth/login").send({
      name: exchange.body.user.username,
      password: "Passw0rd!123",
    });
    expect(passwordAttempt.status).toBe(401);
  });

  it("repeat Google login reuses the account instead of creating a duplicate", async () => {
    vi.stubGlobal("fetch", googleFetch({ sub: "google-repeat", email: "repeat-google@example.com" }));
    const first = await finish("google", await begin("google"));
    const second = await finish("google", await begin("google"));
    const firstExchange = await api
      .post("/api/auth/oauth/session")
      .set("Cookie", cookieHeader(first, "cvforge_oauth_session"))
      .set("X-Forwarded-Proto", "https");
    const secondExchange = await api
      .post("/api/auth/oauth/session")
      .set("Cookie", cookieHeader(second, "cvforge_oauth_session"))
      .set("X-Forwarded-Proto", "https");
    expect(firstExchange.status).toBe(200);
    expect(secondExchange.status).toBe(200);
    expect(secondExchange.body.user.id).toBe(firstExchange.body.user.id);
  });

  it("links a verified Google email to an existing password account without losing password login", async () => {
    vi.stubGlobal("fetch", googleFetch({ sub: "google-link", email: "linked-google@example.com" }));
    const registered = await register(`lg${uniq()}`, "Linked-Google@Example.com");
    expect(registered.status).toBe(201);

    const callback = await finish("google", await begin("google"));
    const exchange = await api
      .post("/api/auth/oauth/session")
      .set("Cookie", cookieHeader(callback, "cvforge_oauth_session"))
      .set("X-Forwarded-Proto", "https");
    expect(exchange.status).toBe(200);
    expect(exchange.body.user.id).toBe(registered.body.user.id);

    const passwordLogin = await api.post("/api/auth/login").send({
      name: registered.body.user.username,
      password: "Passw0rd!123",
    });
    expect(passwordLogin.status).toBe(200);
    expect(passwordLogin.body.user.id).toBe(registered.body.user.id);
  });

  it("refuses to link a second provider identity to the same verified email", async () => {
    const email = `conflict-${uniq()}@example.com`;
    vi.stubGlobal("fetch", googleFetch({ sub: "google-conflict-first", email }));
    const registered = await register(`cf${uniq()}`, email);
    expect(registered.status).toBe(201);
    const firstCallback = await finish("google", await begin("google"));
    const firstExchange = await api
      .post("/api/auth/oauth/session")
      .set("Cookie", cookieHeader(firstCallback, "cvforge_oauth_session"))
      .set("X-Forwarded-Proto", "https");
    expect(firstExchange.status).toBe(200);
    expect(firstExchange.body.user.id).toBe(registered.body.user.id);

    vi.stubGlobal("fetch", googleFetch({ sub: "google-conflict-second", email }));
    const secondCallback = await finish("google", await begin("google"));
    expect(secondCallback.status).toBe(302);
    expect(secondCallback.headers.location).toBe("https://app.test.local/login?oauth_error=account_conflict");
    expect(cookieHeader(secondCallback, "cvforge_oauth_session")).toBeNull();
  });

  it("GitHub uses only a verified email for linking", async () => {
    vi.stubGlobal("fetch", githubFetch({
      user: { id: 9001, login: "private-email-user" },
      emails: [{ email: "unverified-github@example.com", primary: true, verified: false }],
    }));
    const registered = await register(`hg${uniq()}`, "unverified-github@example.com");
    expect(registered.status).toBe(201);

    const callback = await finish("github", await begin("github"));
    const exchange = await api
      .post("/api/auth/oauth/session")
      .set("Cookie", cookieHeader(callback, "cvforge_oauth_session"))
      .set("X-Forwarded-Proto", "https");
    expect(exchange.status).toBe(200);
    expect(exchange.body.user.id).not.toBe(registered.body.user.id);
    expect(exchange.body.user.email).toBeNull();

    const passwordLogin = await api.post("/api/auth/login").send({
      name: registered.body.user.username,
      password: "Passw0rd!123",
    });
    expect(passwordLogin.status).toBe(200);
  });

  it("GitHub login works when the account exposes no verified email", async () => {
    vi.stubGlobal("fetch", githubFetch({
      user: { id: 9002, login: `noemail${uniq()}`, name: "No Email" },
      emails: [],
    }));
    const callback = await finish("github", await begin("github"));
    const exchange = await api
      .post("/api/auth/oauth/session")
      .set("Cookie", cookieHeader(callback, "cvforge_oauth_session"))
      .set("X-Forwarded-Proto", "https");
    expect(exchange.status).toBe(200);
    expect(exchange.body.user.email).toBeNull();
  });

  it("rejects the session exchange from a CORS-allowed but untrusted origin", async () => {
    addOrigin("https://allowed-cors.test");
    vi.stubGlobal("fetch", googleFetch({ sub: "google-origin", email: `origin-${uniq()}@example.com` }));
    const callback = await finish("google", await begin("google"));
    const sessionCookie = cookieHeader(callback, "cvforge_oauth_session");
    expect(sessionCookie).toBeTruthy();

    const res = await api
      .post("/api/auth/oauth/session")
      .set("Cookie", sessionCookie)
      .set("Origin", "https://allowed-cors.test")
      .set("X-Forwarded-Proto", "https");
    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
    expect(res.body.error).toMatch(/cross-origin/i);
    const cleared = allCookies(res).find((value) => String(value).startsWith("cvforge_oauth_session="));
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/i);
  });
});

describe("OAuth failure paths", () => {
  it("provider cancellation redirects with oauth_error=cancelled and clears state", async () => {
    const flow = await begin("google");
    const res = await api
      .get(`/api/auth/google/callback?error=access_denied&state=${encodeURIComponent(flow.state)}`)
      .set("Cookie", flow.cookie)
      .set("X-Forwarded-Proto", "https");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://app.test.local/login?oauth_error=cancelled");
    expect(cookieHeader(res, "cvforge_oauth_session")).toBeNull();
    const clearedState = allCookies(res).find((value) => String(value).startsWith(`${flow.cookieName}=`));
    expect(clearedState).toMatch(/Expires=Thu, 01 Jan 1970/i);
  });

  it("state mismatch is rejected before any provider request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const flow = await begin("google");
    const res = await api
      .get(`/api/auth/google/callback?code=test-code&state=wrong-state`)
      .set("Cookie", flow.cookie)
      .set("X-Forwarded-Proto", "https");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("oauth_error=invalid_state");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("missing state cookie is rejected", async () => {
    const res = await api
      .get("/api/auth/github/callback?code=test-code&state=any-state")
      .set("X-Forwarded-Proto", "https");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("oauth_error=invalid_state");
  });

  it("provider token failure redirects safely without a session cookie", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "bad_verification_code" }, 400)));
    const flow = await begin("github");
    const res = await finish("github", flow);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://app.test.local/login?oauth_error=provider_error");
    expect(cookieHeader(res, "cvforge_oauth_session")).toBeNull();
  });
});
