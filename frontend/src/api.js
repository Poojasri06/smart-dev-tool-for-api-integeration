export function parseApiError(data, fallback = "Request failed") {
  const detail = data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
  }
  return fallback;
}

export function isValidHttpUrl(url) {
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function analyzeIntegration(form, signal) {
  const res = await fetch("/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      docs_url: form.docs_url.trim(),
      use_case: form.use_case.trim(),
      language: form.language,
    }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseApiError(data, "Analysis failed"));
  return data;
}

export async function testEndpoint(url, signal) {
  const res = await fetch("/test-endpoint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, method: "GET" }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseApiError(data, "Test request failed"));
  return data;
}
