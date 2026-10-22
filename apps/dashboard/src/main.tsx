import { createRoot } from "react-dom/client";
import { useState } from "react";
import { scanChange, type ScanResult } from "./analyzer.js";
import "./styles.css";

const starter = "export const createOrder = async (request) => {\n  return db.query('insert into orders values (...)');\n};";

const App = () => {
  const [source, setSource] = useState(starter);
  const [result, setResult] = useState<ScanResult>(() => scanChange(starter));

  return <main>
    <header><div><p className="eyebrow">CODEN / AI CHANGE CHECK</p><h1>Know what your agent changed.</h1><p className="lede">A focused local check for one costly mistake: controller code reaching directly into the database.</p></div><span className="local-badge">Runs locally</span></header>
    <section className="workspace" aria-label="Coden change checker">
      <label htmlFor="change">Paste a controller change</label>
      <textarea id="change" value={source} onChange={(event) => setSource(event.target.value)} spellCheck="false" />
      <button type="button" onClick={() => setResult(scanChange(source))}>Scan change</button>
    </section>
    <section className={`result ${result.decision.toLowerCase()}`} aria-live="polite">
      <p className="eyebrow">CODEN RESULT</p><strong>{result.decision}</strong>
      <p><b>Evidence:</b> {result.evidence}</p>
      <p><b>Next step:</b> {result.remediation}</p>
    </section>
    <section className="how-it-works"><h2>What this proof of concept proves</h2><ol><li>Paste a proposed code change.</li><li>Coden evaluates it against a documented architectural boundary.</li><li>It returns an explainable decision and a concrete correction.</li></ol></section>
  </main>;
};

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Dashboard root is missing.");
createRoot(rootElement).render(<App />);
