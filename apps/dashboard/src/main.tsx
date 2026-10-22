import { createRoot } from "react-dom/client";
import { useMemo, useState } from "react";
import { defaultRules, scanChange, type Rule } from "./analyzer.js";
import "./styles.css";

const passingExample = "import { ordersRepository } from '../repositories/orders.js';\n\nexport const createOrder = async (request) => {\n  return ordersRepository.create(request.body);\n};";
const blockedExample = "export const createOrder = async (request) => {\n  return db.query('insert into orders values (...)');\n};";

const App = () => {
  const [source, setSource] = useState(blockedExample);
  const [rules, setRules] = useState(defaultRules);
  const result = useMemo(() => scanChange(source, rules), [source, rules]);
  const toggleRule = (ruleId: string): void => setRules((current) => current.map((rule) => rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule));

  return <main>
    <header><div><p className="eyebrow">CODEN / LOCAL CHANGE REVIEW</p><h1>Give AI code a clear verdict.</h1><p className="lede">Coden turns a small project constitution into an explainable decision before a change lands.</p></div><span className="local-badge">Runs locally</span></header>
    <section className="flow" aria-label="Coden review flow"><span>1. Set rules</span><span>2. Paste change</span><span>3. Review evidence</span></section>
    <div className="layout">
      <section className="card constitution"><div><p className="eyebrow">CONSTITUTION</p><h2>Enabled project rules</h2></div><div className="rule-list">{rules.map((rule: Rule) => <label className="rule" key={rule.id}><input type="checkbox" checked={rule.enabled} onChange={() => toggleRule(rule.id)} /><span><b>{rule.id} · {rule.title}</b><small>{rule.source}</small></span></label>)}</div></section>
      <section className="card change"><label htmlFor="change"><span className="eyebrow">PROPOSED CHANGE</span><b>Paste code to review</b></label><textarea id="change" value={source} onChange={(event) => setSource(event.target.value)} spellCheck="false" /><div className="actions"><button type="button" onClick={() => setSource(blockedExample)}>Load blocked example</button><button className="secondary" type="button" onClick={() => setSource(passingExample)}>Load passing example</button></div></section>
    </div>
    <section className={`result ${result.decision.toLowerCase()}`} aria-live="polite"><div className="verdict-head"><div><p className="eyebrow">CODEN VERDICT</p><strong>{result.decision}</strong></div><span className="score">{result.score}<small>/100</small></span></div><p>{result.summary}</p>{result.findings.length > 0 ? <ol className="findings">{result.findings.map((finding) => <li key={`${finding.rule.id}-${finding.line}`}><p><code>{finding.rule.id}</code> <b>{finding.rule.title}</b> · line {finding.line}</p><p>{finding.evidence}</p><p className="next"><b>Fix:</b> {finding.rule.remediation}</p></li>)}</ol> : <p className="next"><b>Result:</b> The proposed change complies with every enabled rule.</p>}</section>
    <section className="how-it-works"><h2>What this proof of concept demonstrates</h2><p>The core Coden loop is working end to end: a project policy becomes an active rule, a proposed change is evaluated locally, and the verdict includes the rule, source, evidence, and suggested correction.</p></section>
  </main>;
};

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Dashboard root is missing.");
createRoot(rootElement).render(<App />);
