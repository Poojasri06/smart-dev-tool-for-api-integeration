import { useState, useRef, useEffect } from "react";
import { analyzeIntegration, isValidHttpUrl, testEndpoint } from "./api.js";

const LANGUAGES = ["Python", "JavaScript", "TypeScript", "Java", "Go", "PHP"];
const EXAMPLES = [
  { url: "https://openweathermap.org/api", use_case: "Fetch current weather by city name", language: "Python" },
  { url: "https://docs.github.com/en/rest", use_case: "List repositories and create issues", language: "JavaScript" },
  { url: "https://stripe.com/docs/api", use_case: "Accept payments from users", language: "Python" },
];

const LOADING_STEPS = [
  "Scraping documentation (up to 5 pages)...",
  "Analyzing with Groq AI...",
  "Generating production SDK...",
];

const TEST_STYLES = {
  success: { border: "#16a34a", bg: "#052e16", title: "#4ade80" },
  auth_required: { border: "#ca8a04", bg: "#422006", title: "#fbbf24" },
  rate_limit: { border: "#eab308", bg: "#422006", title: "#fbbf24" },
  timeout: { border: "#52525b", bg: "#18181b", title: "#a1a1aa" },
  network: { border: "#dc2626", bg: "#450a0a", title: "#fca5a5" },
  not_found: { border: "#dc2626", bg: "#450a0a", title: "#fca5a5" },
  client_error: { border: "#f97316", bg: "#431407", title: "#fb923c" },
  server_error: { border: "#dc2626", bg: "#450a0a", title: "#fca5a5" },
};

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy code"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{
        position: "absolute", top: 10, right: 10,
        background: copied ? "#14532d" : "#27272a",
        color: copied ? "#4ade80" : "#a1a1aa",
        border: `1px solid ${copied ? "#16a34a" : "#3f3f46"}`,
        borderRadius: 6, padding: "3px 12px", fontSize: 11,
        cursor: "pointer", transition: "all 0.15s",
      }}
    >{copied ? "Copied" : "Copy"}</button>
  );
}

function CodeBlock({ code }) {
  if (!code) return <p style={{ color: "#71717a", fontSize: 13 }}>No code generated for this section.</p>;
  return (
    <div style={{ position: "relative" }}>
      <pre style={{
        background: "#09090b", border: "1px solid #27272a", borderRadius: 10,
        padding: "1rem", overflow: "auto", fontSize: 12.5, lineHeight: 1.8,
        maxHeight: 480, margin: 0,
      }}><code>{code}</code></pre>
      <CopyBtn text={code} />
    </div>
  );
}

function MethodBadge({ method }) {
  const map = {
    GET: { bg: "#052e16", color: "#4ade80", border: "#16a34a" },
    POST: { bg: "#1e3a5f", color: "#60a5fa", border: "#2563eb" },
    PUT: { bg: "#431407", color: "#fb923c", border: "#c2410c" },
    DELETE: { bg: "#450a0a", color: "#f87171", border: "#dc2626" },
    PATCH: { bg: "#2e1065", color: "#c084fc", border: "#7c3aed" },
  };
  const s = map[method] || { bg: "#27272a", color: "#a1a1aa", border: "#3f3f46" };
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 5, padding: "2px 9px", fontSize: 11, fontWeight: 600,
    }}>{method}</span>
  );
}

function ConfBar({ label, value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = v >= 90 ? "#4ade80" : v >= 75 ? "#818cf8" : "#f59e0b";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid #27272a" }}>
      <span style={{ fontSize: 13, color: "#a1a1aa", minWidth: 200, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, background: "#27272a", borderRadius: 4, height: 8 }} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${v}%`, height: 8, borderRadius: 4, background: color, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color, minWidth: 40, textAlign: "right" }}>{v}%</span>
    </div>
  );
}

function TimeBanner({ seconds, hours }) {
  const h = Number(hours) || 4;
  const saved = Math.max(0, (h * 3600 - parseFloat(seconds)) / 3600).toFixed(1);
  return (
    <div style={{
      background: "#0f172a", border: "1px solid #312e81", borderRadius: 10,
      padding: "0.9rem 1.25rem", display: "flex", gap: 20, alignItems: "center",
      flexWrap: "wrap", marginBottom: "1.2rem",
    }}>
      <div>
        <div style={{ fontSize: 10, color: "#818cf8", fontWeight: 600, textTransform: "uppercase" }}>Manual integration</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{h}h</div>
      </div>
      <div style={{ fontSize: 22, color: "#4338ca" }}>→</div>
      <div>
        <div style={{ fontSize: 10, color: "#34d399", fontWeight: 600, textTransform: "uppercase" }}>Generated in</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#4ade80" }}>{seconds}s</div>
      </div>
      <div style={{ marginLeft: "auto", background: "#1e1b4b", borderRadius: 8, padding: "7px 16px" }}>
        <div style={{ fontSize: 10, color: "#818cf8", textTransform: "uppercase" }}>Time saved</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#a5b4fc" }}>~{saved}h</div>
      </div>
    </div>
  );
}

function SkeletonPanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
      <div className="skeleton" style={{ height: 28, width: "40%" }} />
      <div className="skeleton" style={{ height: 16, width: "70%" }} />
      <div className="skeleton" style={{ height: 80, width: "100%" }} />
      <div className="skeleton" style={{ height: 120, width: "100%" }} />
      <div className="skeleton" style={{ height: 120, width: "100%" }} />
    </div>
  );
}

function TestResult({ data }) {
  if (!data) return null;
  const style = TEST_STYLES[data.category] || TEST_STYLES.client_error;
  return (
    <div style={{
      marginTop: 10, padding: "10px 12px", borderRadius: 8,
      border: `1px solid ${style.border}`, background: style.bg,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: style.title }}>
        {data.title} {data.status_code ? `(HTTP ${data.status_code})` : ""}
      </div>
      <p style={{ fontSize: 12, color: "#d4d4d8", lineHeight: 1.55, margin: "6px 0 0" }}>{data.message}</p>
      {data.body_preview ? (
        <pre style={{
          marginTop: 8, background: "#09090b", border: "1px solid #27272a",
          borderRadius: 6, padding: "0.6rem", fontSize: 11, maxHeight: 180, overflow: "auto",
        }}>{data.body_preview}</pre>
      ) : null}
    </div>
  );
}

const inp = {
  width: "100%", background: "#18181b", border: "1px solid #3f3f46",
  color: "#e4e4e7", borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none",
};

const TABS = [
  { id: "endpoints", label: "Endpoints" },
  { id: "auth", label: "Auth" },
  { id: "sdk", label: "Production SDK" },
  { id: "quickstart", label: "Quick Start" },
  { id: "confidence", label: "Confidence" },
  { id: "tips", label: "Tips" },
];

export default function App() {
  const [form, setForm] = useState({ docs_url: "", use_case: "", language: "Python" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("endpoints");
  const [elapsed, setElapsed] = useState(0);
  const [testData, setTestData] = useState({});
  const [testLoading, setTestLoading] = useState({});
  const timerRef = useRef(null);
  const stepRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearInterval(stepRef.current);
    abortRef.current?.abort();
  }, []);

  const submit = async () => {
    const url = form.docs_url.trim();
    const useCase = form.use_case.trim();
    if (!url || !useCase) {
      setError("Please fill in both the URL and use case.");
      return;
    }
    if (!isValidHttpUrl(url)) {
      setError("Enter a valid http or https documentation URL.");
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError("");
    setResult(null);
    setTestData({});
    setElapsed(0);
    setLoadStep(0);

    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(((Date.now() - start) / 1000).toFixed(1));
    }, 200);
    stepRef.current = setInterval(() => {
      setLoadStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 3500);

    try {
      const data = await analyzeIntegration({ ...form, docs_url: url, use_case: useCase }, abortRef.current.signal);
      setElapsed(((Date.now() - start) / 1000).toFixed(1));
      setResult(data);
      setTab("endpoints");
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      clearInterval(timerRef.current);
      clearInterval(stepRef.current);
      setLoading(false);
    }
  };

  const testEp = async (ep, i) => {
    const base = (result?.base_url || "").replace(/\/$/, "");
    const path = ep.path?.startsWith("/") ? ep.path : `/${ep.path || ""}`;
    const url = base ? `${base}${path}` : null;
    if (!url || !isValidHttpUrl(url)) {
      setTestData((d) => ({
        ...d,
        [i]: {
          category: "network",
          title: "Cannot test this URL",
          message: "Base URL or path is missing. Use the generated SDK with your API key.",
          status_code: 0,
          body_preview: "",
        },
      }));
      return;
    }

    setTestLoading((t) => ({ ...t, [i]: true }));
    try {
      const data = await testEndpoint(url);
      setTestData((d) => ({ ...d, [i]: data }));
    } catch (e) {
      setTestData((d) => ({
        ...d,
        [i]: {
          category: "network",
          title: "Test failed",
          message: e.message,
          status_code: 0,
          body_preview: "",
        },
      }));
    } finally {
      setTestLoading((t) => ({ ...t, [i]: false }));
    }
  };

  return (
    <div className="app-layout">
      <aside className="app-sidebar" style={{
        background: "#09090b", borderRight: "1px solid #27272a",
        padding: "1.5rem", display: "flex", flexDirection: "column",
        gap: "1.2rem", height: "100vh", overflowY: "auto", position: "sticky", top: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, background: "linear-gradient(135deg,#6366f1,#06b6d4)",
            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>⚡</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Smart DevTool</div>
            <div style={{ fontSize: 11, color: "#52525b" }}>API Integration Generator</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#71717a", display: "block", marginBottom: 6 }}>API DOCS URL</label>
            <input
              style={inp}
              value={form.docs_url}
              onChange={(e) => setForm({ ...form, docs_url: e.target.value })}
              placeholder="https://openweathermap.org/api"
              onKeyDown={(e) => e.key === "Enter" && !loading && submit()}
              disabled={loading}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#71717a", display: "block", marginBottom: 6 }}>USE CASE</label>
            <textarea
              style={{ ...inp, resize: "vertical", lineHeight: 1.6 }}
              rows={3}
              value={form.use_case}
              onChange={(e) => setForm({ ...form, use_case: e.target.value })}
              placeholder="e.g. Fetch current weather by city name"
              disabled={loading}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#71717a", display: "block", marginBottom: 6 }}>LANGUAGE</label>
            <select
              style={{ ...inp, background: "#18181b" }}
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              disabled={loading}
            >
              {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <button type="button" onClick={submit} disabled={loading} style={{
          background: loading ? "#3f3f46" : "linear-gradient(135deg,#6366f1,#4f46e5)",
          color: "#fff", border: "none", borderRadius: 8, padding: "12px",
          fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
        }}>
          {loading ? `Analyzing... ${elapsed}s` : "Generate Integration"}
        </button>

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {LOADING_STEPS.map((s, i) => (
              <div key={s} style={{
                fontSize: 12,
                color: i <= loadStep ? "#818cf8" : "#52525b",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: i <= loadStep ? "#6366f1" : "#3f3f46",
                }} />
                {s}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div role="alert" style={{
            background: "#450a0a", border: "1px solid #dc2626", borderRadius: 8,
            padding: "10px 14px", fontSize: 13, color: "#fca5a5",
          }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: "auto" }}>
          <div style={{ fontSize: 10, color: "#3f3f46", marginBottom: 8, textTransform: "uppercase" }}>Try an example</div>
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setForm(ex); setError(""); }}
              style={{
                display: "block", background: "none", border: "none", padding: "4px 0",
                fontSize: 11, color: "#6366f1", cursor: "pointer", textAlign: "left", width: "100%",
              }}
            >
              → {new URL(ex.url).hostname}
            </button>
          ))}
        </div>
      </aside>

      <main style={{ padding: "1.5rem", overflowY: "auto", minHeight: "50vh" }}>
        {loading && <SkeletonPanel />}

        {!result && !loading && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            minHeight: "60vh", flexDirection: "column", gap: 14, color: "#3f3f46", textAlign: "center",
          }}>
            <div style={{ fontSize: 52 }}>⚡</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#52525b" }}>Paste a docs URL to get started</div>
            <div style={{ fontSize: 13, maxWidth: 360 }}>
              Paste API documentation, describe your use case, and get auth, endpoints, SDK code, and confidence scores in seconds.
            </div>
          </div>
        )}

        {result && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>{result.api_name}</h1>
              {result.base_url && (
                <code style={{ fontSize: 12, color: "#52525b" }}>{result.base_url}</code>
              )}
              <p style={{ color: "#71717a", fontSize: 14, marginTop: 8 }}>{result.summary}</p>
            </div>

            <TimeBanner seconds={elapsed} hours={result.manual_hours_saved} />

            <div style={{ display: "flex", borderBottom: "1px solid #27272a", overflowX: "auto", gap: 2 }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  style={{
                    background: "none", border: "none",
                    borderBottom: `2px solid ${tab === t.id ? "#6366f1" : "transparent"}`,
                    padding: "10px 14px", fontSize: 12,
                    fontWeight: tab === t.id ? 600 : 400,
                    color: tab === t.id ? "#818cf8" : "#71717a",
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "endpoints" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {(result.endpoints || []).length === 0 ? (
                  <p style={{ color: "#71717a" }}>No endpoints extracted. Try a more specific API reference URL.</p>
                ) : (
                  (result.endpoints || []).map((ep, i) => (
                    <div key={`${ep.method}-${ep.path}-${i}`} style={{
                      border: "1px solid #27272a", borderRadius: 10,
                      padding: "1rem 1.1rem", background: "#18181b",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7, flexWrap: "wrap" }}>
                        <MethodBadge method={ep.method} />
                        <code style={{ fontSize: 13, color: "#06b6d4" }}>{ep.path}</code>
                        {ep.testable && ep.method === "GET" && (
                          <button
                            type="button"
                            onClick={() => testEp(ep, i)}
                            disabled={testLoading[i]}
                            style={{
                              background: "#0e4429", border: "1px solid #16a34a", color: "#4ade80",
                              borderRadius: 6, padding: "3px 12px", fontSize: 11, cursor: "pointer",
                            }}
                          >
                            {testLoading[i] ? "Testing..." : "Test Request"}
                          </button>
                        )}
                      </div>
                      <p style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 7 }}>{ep.purpose}</p>
                      {(ep.params || []).length > 0 && (
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 5 }}>
                          <span style={{ fontSize: 11, color: "#52525b" }}>Params:</span>
                          {ep.params.map((p, j) => (
                            <span key={j} style={{
                              background: "#27272a", color: "#a1a1aa",
                              borderRadius: 4, padding: "1px 8px", fontSize: 11,
                            }}>{p}</span>
                          ))}
                        </div>
                      )}
                      {ep.example_response && (
                        <p style={{ fontSize: 12, color: "#52525b", fontStyle: "italic" }}>
                          Returns: {ep.example_response}
                        </p>
                      )}
                      <TestResult data={testData[i]} />
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "auth" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {result.authentication ? (
                  <>
                    <span style={{
                      alignSelf: "flex-start", background: "#1e1b4b", color: "#a5b4fc",
                      borderRadius: 6, padding: "3px 12px", fontSize: 12, fontWeight: 600,
                    }}>
                      {result.authentication.type}
                    </span>
                    <div style={{
                      background: "#18181b", border: "1px solid #27272a", borderRadius: 10,
                      padding: "1rem", fontSize: 14, color: "#a1a1aa", lineHeight: 1.85, whiteSpace: "pre-line",
                    }}>
                      {result.authentication.explanation}
                    </div>
                    {result.authentication.header_example && (
                      <>
                        <div style={{ fontSize: 11, color: "#52525b" }}>HEADER FORMAT</div>
                        <CodeBlock code={result.authentication.header_example} />
                      </>
                    )}
                  </>
                ) : (
                  <p style={{ color: "#71717a" }}>No authentication details extracted.</p>
                )}
              </div>
            )}

            {tab === "sdk" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <p style={{ fontSize: 12, color: "#52525b", margin: 0 }}>
                  Production-ready wrapper with error handling. Replace placeholder API keys before running.
                </p>
                <CodeBlock code={result.wrapper_class} />
                {result.sdk_suggestion && (
                  <div style={{
                    background: "#0c1a0e", border: "1px solid #16a34a", borderRadius: 8,
                    padding: "10px 14px", fontSize: 13, color: "#4ade80", lineHeight: 1.7,
                  }}>
                    {result.sdk_suggestion}
                  </div>
                )}
              </div>
            )}

            {tab === "quickstart" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <p style={{ fontSize: 13, color: "#52525b", margin: 0 }}>Install, configure env vars, and run.</p>
                <CodeBlock code={result.quick_start} />
              </div>
            )}

            {tab === "confidence" && result.confidence && (
              <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 10, padding: "1rem" }}>
                <ConfBar label="Authentication detection" value={result.confidence.auth_extraction} />
                <ConfBar label="Endpoint matching" value={result.confidence.endpoint_matching} />
                <ConfBar label="Request body structure" value={result.confidence.request_body_structure} />
                <ConfBar label="SDK / code completeness" value={result.confidence.sdk_completeness} />
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  paddingTop: 12, borderTop: "1px solid #27272a", marginTop: 8,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Overall confidence</span>
                  <span style={{ fontSize: 28, fontWeight: 700, color: "#818cf8" }}>{result.confidence.overall}%</span>
                </div>
              </div>
            )}

            {tab === "tips" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {(result.gotchas || []).length === 0 ? (
                  <p style={{ color: "#71717a" }}>No gotchas listed.</p>
                ) : (
                  (result.gotchas || []).map((tip, i) => (
                    <div key={i} style={{
                      display: "flex", gap: 10, background: "#18181b",
                      border: "1px solid #27272a", borderRadius: 10, padding: "0.8rem 1rem",
                    }}>
                      <span style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.75 }}>{tip}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
