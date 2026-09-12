import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AccountCard } from "../src/index.js";
import "../styles.css";
import "./page.css";

function App() {
  const [visible, setVisible] = useState(false);
  return <main>
    <div className="page-heading">
      <div><p className="eyebrow">DEMO DATA</p><h1>Your accounts</h1><p className="intro">Balances and account details at a glance.</p></div>
      <button type="button" aria-pressed={visible} aria-controls="accounts" onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"} account details</button>
    </div>
    <div id="accounts" className="account-grid">
      <AccountCard account={{ name: "Everyday account", currency: "GBP" }} balance={{ effectiveBalance: { currency: "GBP", minorUnits: 248650 } }} identifiers={{ accountIdentifier: "12345678", bankIdentifier: "040004" }} masked={!visible}>
        <span className="footer-note">Main account · Includes pending outgoing payments</span>
      </AccountCard>
      <AccountCard account={{ name: "Euro account", currency: "EUR" }} balance={{ effectiveBalance: { currency: "EUR", minorUnits: 85624 } }} identifiers={{ iban: "GB72SRLG60837112345678", bic: "SRLGGB2L" }} masked={!visible}>
        <span className="footer-note">Euro balance · Ready for your next trip</span>
      </AccountCard>
    </div>
    <section className="states" aria-label="Loading and error examples">
      <h2>Account states</h2>
      <div className="account-grid">
        <AccountCard title="Loading" status="loading" />
        <AccountCard title="Unavailable" status="error" />
      </div>
    </section>
    <p className="page-note">A community component example. All balances and account details are fictional.</p>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
