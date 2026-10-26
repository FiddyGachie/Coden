import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { defaultRules, scanChange, type Rule } from "./analyzer.js";
import { isVsCodeWebview, requestCoreScan, subscribeToCoreScans } from "./vscode-bridge.js";
import { useScanStore } from "./store.js";
import { useConstitutionStore } from "./constitution-store.js";
import { DEMO_RULES, DEMO_CONFLICTS } from "./constitution-demo-data.js";
import { ConflictPanel } from "./ConflictPanel.js";
import { RulesTable } from "./RulesTable.js";
import { ComplianceWidget } from "./ComplianceWidget.js";
import "./styles.css";

// ── External links — update when the extension is published ──────────────────
const VSCODE_MARKETPLACE_URL = "https://marketplace.visualstudio.com/items?itemName=coden.coden-vscode";
const GITHUB_RELEASES_URL = "https://github.com/kephotho/Coden/releases/latest";

const passingExample = "import { ordersRepository } from '../repositories/orders.js';\n\nexport const createOrder = async (request) => {\n  return ordersRepository.create(request.body);\n};";
const blockedExample = "export const createOrder = async (request) => {\n  return db.query('insert into orders values (...)');\n};";

// ── Download / landing section (web only) ────────────────────────────────────

const DownloadSection = (): ReactElement => (
  <section className="download-section" aria-label="Get the VS Code extension">
    <div className="download-inner">
      <div className="download-text">
        <p className="eyebrow">VS CODE EXTENSION</p>
        <h2 className="download-heading">Full power in your editor</h2>
        <p className="download-body">
          The live demo runs entirely in the browser with demo data. Install the
          VS Code extension to connect Coden to a real project — your own
          rules, your own code, all evaluated locally with no data leaving your
          machine.
        </p>
        <ul className="download-features">
          <li>Real-time check on every saved change</li>
          <li>Project-specific constitution from your docs</li>
          <li>Works offline — no API keys needed for deterministic checks</li>
          <li>Optional Gemini AI for semantic rule extraction (free tier)</li>
        </ul>
      </div>
      <div className="download-ctas">
        <a
          className="cta-primary"
          href={VSCODE_MARKETPLACE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Install Coden from the VS Code Marketplace"
        >
          <svg width="20" height="20" viewBox="0 0 128 128" fill="currentColor" aria-hidden="true">
            <path d="M95.5 9.5L63 39.5 31 13 9.5 31l32 31-32 31L31 115l32-26 32.5 30 25.5-15V24.5L95.5 9.5zM96 95L64 64l32-31v62z"/>
          </svg>
          Install from Marketplace
        </a>
        <a
          className="cta-secondary"
          href={GITHUB_RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download .vsix from GitHub Releases"
        >
          Download .vsix
        </a>
      </div>
    </div>
  </section>
);

// ── Footer (web only) ─────────────────────────────────────────────────────────

const Footer = (): ReactElement => (
  <footer className="site-footer">
    <p>
      <span>Coden</span>
      <span className="footer-sep">·</span>
      <a href={GITHUB_RELEASES_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
      <span className="footer-sep">·</span>
      <a href={VSCODE_MARKETPLACE_URL} target="_blank" rel="noopener noreferrer">VS Code Marketplace</a>
      <span className="footer-sep">·</span>
      <span className="footer-note">Runs entirely in your browser. No data sent anywhere.</span>
    </p>
  </footer>
);

// ── Panel state components ────────────────────────────────────────────────────

const LoadingPanel = (): ReactElement => (
  <section className="result loading" aria-live="polite" aria-busy="true">
    <p className="eyebrow">WARDEN</p>
    <p>Checking change with Warden core…</p>
    <span className="spinner" aria-hidden="true" />
  </section>
);

const ErrorPanel = ({ message }: { message: string }): ReactElement => (
  <section className="result error" role="alert" aria-live="assertive">
    <p className="eyebrow">WARDEN — ERROR</p>
    <p>{message}</p>
    <p className="next"><b>Try:</b> Run <code>Warden: Restart Core</code> from the Command Palette.</p>
  </section>
);

const IdlePanel = (): ReactElement => (
  <section className="result idle" aria-live="polite">
    <p className="eyebrow">WARDEN</p>
    <p>Paste a proposed change and press <b>Run Warden check</b> to see the verdict.</p>
  </section>
);

// ── Scan tab ──────────────────────────────────────────────────────────────────

const ScanTab = (): ReactElement => {
  const [source, setSource] = useState(blockedExample);
  const [rules, setRules] = useState(defaultRules);
  const { verdict: panelState, findings: coreFindings, startScan, setResult, setError, reset } = useScanStore();
  const isChecking = panelState.status === "loading" || panelState.status === "stale";

  const localResult = useMemo(() => scanChange(source, rules), [source, rules]);
  const toggleRule = (ruleId: string): void => setRules((current) => current.map((rule) => rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule));
  const inVsCode = isVsCodeWebview();

  const displayed = panelState.status === "ready" || panelState.status === "stale" ? panelState.data : localResult;
  const displayedFindings = panelState.status === "ready" || panelState.status === "stale"
    ? coreFindings.map((f) => ({ rule: { id: f.ruleId, title: f.message, remediation: "Update the change to satisfy this constitution rule." }, line: f.line ?? 1, evidence: `${f.path}: ${f.message}` }))
    : localResult.findings;

  useEffect(() => subscribeToCoreScans(
    (response) => setResult(response.verdict, response.findings),
    (message) => setError(message)
  ), [setResult, setError]);

  useEffect(() => reset(), [source, reset]);

  const runCheck = (): void => {
    if (requestCoreScan(source)) { startScan(); return; }
    reset();
  };

  const renderResultPanel = (): ReactElement => {
    if (panelState.status === "loading") return <LoadingPanel />;
    if (panelState.status === "error") return <ErrorPanel message={panelState.message} />;
    if (panelState.status === "idle" && inVsCode) return <IdlePanel />;

    const isStale = panelState.status === "stale";
    return (
      <section className={`result ${displayed.decision.toLowerCase()}${isStale ? " stale" : ""}`} aria-live="polite">
        {isStale && <p className="stale-badge" aria-label="Stale result">Refreshing…</p>}
        <div className="verdict-head">
          <div>
            <p className="eyebrow">WARDEN VERDICT</p>
            <strong>{displayed.decision}</strong>
          </div>
          <span className="score">{displayed.score}<small>/100</small></span>
        </div>
        <p>{"reasons" in displayed ? displayed.reasons.join(" ") : displayed.summary}</p>
        {displayedFindings.length > 0
          ? <ol className="findings">{displayedFindings.map((finding) =>
            <li key={`${finding.rule.id}-${finding.line}`}>
              <p><code>{finding.rule.id}</code> <b>{finding.rule.title}</b> · line {finding.line}</p>
              <p>{finding.evidence}</p>
              <p className="next"><b>Fix:</b> {finding.rule.remediation}</p>
            </li>
          )}</ol>
          : <p className="next"><b>Result:</b> The proposed change complies with every enabled rule.</p>
        }
      </section>
    );
  };

  return (
    <>
      <section className="flow" aria-label="Warden review flow">
        <span>1. Set rules</span>
        <span>2. Paste change</span>
        <span>3. Review evidence</span>
      </section>

      <div className="layout">
        <section className="card constitution">
          <div>
            <p className="eyebrow">CONSTITUTION</p>
            <h2>Enabled project rules</h2>
          </div>
          <div className="rule-list">
            {rules.map((rule: Rule) =>
              <label className="rule" key={rule.id}>
                <input type="checkbox" checked={rule.enabled} onChange={() => toggleRule(rule.id)} />
                <span><b>{rule.id} · {rule.title}</b><small>{rule.source}</small></span>
              </label>
            )}
          </div>
        </section>

        <section className="card change">
          <label htmlFor="change">
            <span className="eyebrow">PROPOSED CHANGE</span>
            <b>Paste code to review</b>
          </label>
          <textarea id="change" value={source} onChange={(event) => setSource(event.target.value)} spellCheck="false" />
          <div className="actions">
            <button type="button" onClick={() => setSource(blockedExample)}>Load blocked example</button>
            <button className="secondary" type="button" onClick={() => setSource(passingExample)}>Load passing example</button>
            <button type="button" onClick={runCheck} disabled={isChecking}>
              {isChecking ? "Checking…" : inVsCode ? "Run Warden check" : "Refresh browser check"}
            </button>
          </div>
          {inVsCode
            ? <p className="host-note">Connected to the local Warden core through the VS Code extension.</p>
            : <p className="host-note">Browser preview uses the local demo analyzer. Open Mission Control in VS Code for the core-backed check.</p>
          }
        </section>
      </div>

      {renderResultPanel()}

      <section className="how-it-works">
        <h2>What this proof of concept demonstrates</h2>
        <p>The core Warden loop is working end to end: a project policy becomes an active rule, a proposed change is evaluated locally, and the verdict includes the rule, source, evidence, and suggested correction.</p>
      </section>
    </>
  );
};

// ── Constitution tab ──────────────────────────────────────────────────────────

const ConstitutionTab = ({ scoreHistory }: { scoreHistory: number[] }): ReactElement => {
  const { rules, unresolvedConflictIds } = useConstitutionStore();
  const approved  = rules.filter((r) => r.status === "approved").length;
  const unresolved = unresolvedConflictIds().length;

  return (
    <>
      {unresolved > 0 && (
        <div className="phase-gate-banner" role="status">
          <span>🔒</span>
          <span>
            <b>{unresolved} conflict{unresolved > 1 ? "s" : ""} must be resolved</b> before blocked rules can be approved.
          </span>
        </div>
      )}
      {unresolved === 0 && approved > 0 && (
        <div className="phase-gate-banner phase-gate-ok" role="status">
          <span>✓</span>
          <span>
            All conflicts resolved — <b>{approved} rule{approved > 1 ? "s" : ""} approved</b> and ready to enforce.
          </span>
        </div>
      )}

      <ComplianceWidget scoreHistory={scoreHistory} />
      <ConflictPanel />
      <RulesTable />
    </>
  );
};

// ── Tab navigation ────────────────────────────────────────────────────────────

type Tab = "scan" | "constitution";

// ── Main app ─────────────────────────────────────────────────────────────────

const App = (): ReactElement => {
  const [tab, setTab] = useState<Tab>("constitution");
  const [scoreHistory, setScoreHistory] = useState<number[]>([]);
  const { load } = useConstitutionStore();
  const { verdict } = useScanStore();

  // Accumulate overall compliance scores into the sparkline history.
  // We record a new entry every time the scan verdict changes to "ready".
  const lastRecordedVerdict = useRef<string | null>(null);
  const appendScore = useCallback((score: number) => {
    setScoreHistory((prev) => [...prev.slice(-19), score]); // keep last 20
  }, []);

  useEffect(() => {
    if (verdict.status !== "ready") return;
    const key = verdict.data.generatedAt;
    if (key === lastRecordedVerdict.current) return;
    lastRecordedVerdict.current = key;
    appendScore(verdict.data.score);
  }, [verdict, appendScore]);

  // Seed demo data once on mount.
  useEffect(() => {
    load(DEMO_RULES, DEMO_CONFLICTS);
  }, [load]);

  const inVsCode = isVsCodeWebview();

  return <main>
    <header>
      <div>
        <p className="eyebrow">CODEN / MISSION CONTROL</p>
        <h1>Give AI code a clear verdict.</h1>
        <p className="lede">Coden turns your project constitution into an explainable decision before a change lands.</p>
      </div>
      {inVsCode
        ? <span className="local-badge">Runs locally</span>
        : <span className="local-badge web-badge">Live demo</span>
      }
    </header>

    {!inVsCode && <DownloadSection />}

    {/* Tab bar */}
    <nav className="tab-bar" aria-label="Main navigation">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "constitution"}
        className={tab === "constitution" ? "tab-btn tab-active" : "tab-btn"}
        onClick={() => setTab("constitution")}
      >
        Constitution
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "scan"}
        className={tab === "scan" ? "tab-btn tab-active" : "tab-btn"}
        onClick={() => setTab("scan")}
      >
        Change scanner
      </button>
    </nav>

    {tab === "constitution" ? <ConstitutionTab scoreHistory={scoreHistory} /> : <ScanTab />}

    {!inVsCode && <Footer />}
  </main>;
};

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Dashboard root is missing.");
createRoot(rootElement).render(<App />);
