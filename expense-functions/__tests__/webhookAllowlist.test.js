/**
 * webhookAllowlist.test.js
 *
 * Tests the SSRF-prevention webhook allowlist logic (H-6).
 * The isAllowedWebhook function lives inside notifyClaimStatus.js and
 * validateClaim.js — we duplicate the logic here as a standalone helper
 * so it can be tested in isolation without mocking Azure Functions / Firestore.
 */

// Reproduce the exact allowlist function from notifyClaimStatus.js / validateClaim.js
function isAllowedWebhook(url) {
  if (!url || typeof url !== "string") return false;
  return (
    url.startsWith("https://hooks.slack.com/services/") ||
    url.startsWith("https://outlook.office.com/webhook/") ||
    url.startsWith("https://outlook.office365.com/webhook/") ||
    /^https:\/\/[a-z0-9-]+\.webhook\.office\.com\//.test(url)
  );
}

describe("isAllowedWebhook — SSRF prevention", () => {
  // ── Valid / allowed URLs ────────────────────────────────────

  test("allows a real Slack webhook URL", () => {
    expect(isAllowedWebhook(
      "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"
    )).toBe(true);
  });

  test("allows an Outlook webhook (office.com)", () => {
    expect(isAllowedWebhook(
      "https://outlook.office.com/webhook/00000000-0000-0000-0000-000000000000@00000000-0000-0000-0000-000000000000/IncomingWebhook/abc123"
    )).toBe(true);
  });

  test("allows an Outlook webhook (office365.com)", () => {
    expect(isAllowedWebhook(
      "https://outlook.office365.com/webhook/some-path"
    )).toBe(true);
  });

  test("allows a Teams regional webhook (webhook.office.com subdomain)", () => {
    expect(isAllowedWebhook(
      "https://myorg.webhook.office.com/webhookb2/some-path"
    )).toBe(true);
  });

  // ── Blocked / disallowed URLs ───────────────────────────────

  test("blocks an arbitrary HTTPS URL (SSRF attack target)", () => {
    expect(isAllowedWebhook("https://evil.com/exfiltrate")).toBe(false);
  });

  test("blocks an internal network address", () => {
    expect(isAllowedWebhook("https://192.168.1.1/secret")).toBe(false);
  });

  test("blocks localhost", () => {
    expect(isAllowedWebhook("http://localhost:8080/hook")).toBe(false);
  });

  test("blocks HTTP (non-TLS)", () => {
    expect(isAllowedWebhook("http://hooks.slack.com/services/T000/B000/XXX")).toBe(false);
  });

  test("blocks a URL that tries to spoof Slack with a subdomain", () => {
    expect(isAllowedWebhook("https://hooks.slack.com.evil.com/services/T000")).toBe(false);
  });

  test("blocks a URL that embeds hooks.slack.com in the path", () => {
    expect(isAllowedWebhook("https://evil.com/redirect?to=https://hooks.slack.com/services/T000")).toBe(false);
  });

  test("blocks null", () => {
    expect(isAllowedWebhook(null)).toBe(false);
  });

  test("blocks undefined", () => {
    expect(isAllowedWebhook(undefined)).toBe(false);
  });

  test("blocks an empty string", () => {
    expect(isAllowedWebhook("")).toBe(false);
  });

  test("blocks a non-string (number)", () => {
    expect(isAllowedWebhook(12345)).toBe(false);
  });

  test("blocks a file:// URL", () => {
    expect(isAllowedWebhook("file:///etc/passwd")).toBe(false);
  });
});
