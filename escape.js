// HaulNOW shared output-escaping helpers. Every user-controlled value rendered into HTML must go through these.
(function (root) {
  const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"'`]/g, (c) => MAP[c]);
  }
  // Only absolute http(s) URLs are allowed as images; anything else (javascript:, data:, relative) is dropped.
  function safeImageUrl(value) {
    const raw = String(value ?? "").trim();
    if (!/^https?:\/\//i.test(raw)) return "";
    try {
      const url = new URL(raw);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch { return ""; }
  }
  // Phone numbers for tel: links keep only digits and a leading +.
  function safeTel(value) { return String(value ?? "").replace(/[^0-9+]/g, ""); }
  const api = { escapeHtml, safeImageUrl, safeTel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== "undefined" ? window : globalThis);
