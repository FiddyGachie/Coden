import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { demoVerdict } from "./demo-state.js";
import "./styles.css";

const Panel = ({ title, children }: { title: string; children: ReactNode }) => <section className="panel"><h2>{title}</h2>{children}</section>;
const App = () => <main>
  <header><div><p className="eyebrow">WARDEN / LOCAL MISSION CONTROL</p><h1>Evidence before autonomy.</h1></div><div className="badges"><span>Offline</span><span>Demo data</span></div></header>
  <section className={`verdict ${demoVerdict.decision.toLowerCase()}`} aria-label="Current verdict"><p className="eyebrow">CURRENT VERDICT</p><div className="verdict-row"><strong>{demoVerdict.decision}</strong><span>Score {demoVerdict.score}/100</span></div><ul>{demoVerdict.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="muted">Checks run: {demoVerdict.checksRun}; skipped: {demoVerdict.checksSkipped.join(", ")}</p></section>
  <div className="grid">
    <Panel title="Constitution Forge"><p>0 approved rules. Ingest project documents to compile cited constraints.</p><button>Forge constitution</button></Panel>
    <Panel title="Gatekeeper"><p>Preventive control · waiting for an agent intent.</p><code>warden_check_intent</code></Panel>
    <Panel title="Earned Autonomy"><p className="metric">L1</p><p>Agent has limited write authority until clean evidence accumulates.</p></Panel>
    <Panel title="Behavior Diff"><p>2 observed changes require review: unexpected network attempt and undeclared secret read.</p><button>Inspect evidence</button></Panel>
    <Panel title="Flight Recorder"><p>No live session selected. Events are kept locally and redacted before export.</p></Panel>
    <Panel title="Benchmark"><p>Load deterministic fixtures to measure Warden—not a model—against seeded scenarios.</p><button>Run smoke benchmark</button></Panel>
  </div>
</main>;

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Dashboard root is missing.");
createRoot(rootElement).render(<App />);
