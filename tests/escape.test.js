const test = require("node:test");
const assert = require("node:assert");
const { escapeHtml, safeImageUrl, safeTel } = require("../escape.js");

test("escapeHtml neutralizes markup and quotes", () => {
  assert.strictEqual(escapeHtml(`<img src=x onerror="alert('1')">&\``), "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;&#96;");
  assert.strictEqual(escapeHtml(null), "");
  assert.strictEqual(escapeHtml(42), "42");
});

test("safeImageUrl allows only http(s)", () => {
  assert.strictEqual(safeImageUrl("https://example.com/a.jpg"), "https://example.com/a.jpg");
  assert.strictEqual(safeImageUrl(" http://example.com/b.png "), "http://example.com/b.png");
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:image/svg+xml,<svg>", "/local.png", "//evil.com/x", "", null]) {
    assert.strictEqual(safeImageUrl(bad), "", String(bad));
  }
  assert.ok(!safeImageUrl('https://x.com/a.jpg" onerror="alert(1)').includes('"'));
});

test("safeTel strips non-phone characters", () => {
  assert.strictEqual(safeTel("+1 (555) 555-0123\"><script>"), "+15555550123");
});
