import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  AccountCard,
  AccountDetails,
  Balance,
  formatMoney,
  type AccountCardProps,
} from "../src/index.js";
import "../styles.css";
import "./page.css";

const repository =
  "https://github.com/MMZaini/starling-sdk/tree/main/packages/react";
const sections = [
  { id: "overview", label: "Overview" },
  { id: "account-card", label: "AccountCard", number: "01" },
  { id: "balance", label: "Balance", number: "02" },
  { id: "account-details", label: "AccountDetails", number: "03" },
  { id: "format-money", label: "formatMoney" },
  { id: "installation", label: "Installation" },
];
const domestic = { accountIdentifier: "12345678", bankIdentifier: "040004" };
const international = { iban: "GB72SRLG60837112345678", bic: "SRLGGB2L" };
const accounts = {
  GBP: { name: "Everyday account", minorUnits: 248650, identifiers: domestic },
  EUR: { name: "Euro account", minorUnits: 85624, identifiers: international },
  USD: {
    name: "Dollar account",
    minorUnits: 124099,
    identifiers: international,
  },
};
type Currency = keyof typeof accounts;

function Icon({
  name,
  size = 16,
}: {
  name: "arrow" | "copy" | "check" | "menu" | "close" | "box" | "code";
  size?: number;
}) {
  const paths = {
    arrow: <path d="M8 4h6v6M14 4 4 14" />,
    copy: (
      <>
        <rect x="6" y="6" width="9" height="10" rx="1.5" />
        <path d="M11 6V3H3v10h3" />
      </>
    ),
    check: <path d="m3 9 4 4 8-8" />,
    menu: <path d="M3 5h12M3 9h12M3 13h12" />,
    close: <path d="m4 4 10 10M14 4 4 14" />,
    box: (
      <>
        <rect x="3" y="3" width="12" height="12" rx="2" />
        <path d="M3 7h12M7 7v8" />
      </>
    ),
    code: <path d="m6 5-4 4 4 4m6-8 4 4-4 4M10 3 8 15" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function CopyButton({
  value,
  label = "Copy code",
  onCopyError,
}: {
  value: string;
  label?: string;
  onCopyError?: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback("Copied");
    } catch {
      setFeedback("Select the code below to copy it.");
      onCopyError?.();
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(""), 3000);
  }
  return (
    <span className="showcase-copy-control">
      <button
        className="showcase-copy"
        type="button"
        onClick={copy}
        aria-label={label}
      >
        <Icon name={feedback === "Copied" ? "check" : "copy"} />
        <span>{feedback === "Copied" ? feedback : label}</span>
      </button>
      <span className="showcase-copy-feedback" role="status">
        {feedback}
      </span>
    </span>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="showcase-code" tabIndex={0}>
      <code>{children}</code>
    </pre>
  );
}

function Example({
  name,
  code,
  children,
  note,
}: {
  name: string;
  code: string;
  children: ReactNode;
  note: string;
}) {
  const [mode, setMode] = useState<"preview" | "code">("preview");
  return (
    <div className="showcase-example">
      <div className="showcase-example-toolbar">
        <div
          className="showcase-view-switch"
          role="group"
          aria-label={`${name} view`}
        >
          <button
            type="button"
            aria-pressed={mode === "preview"}
            onClick={() => setMode("preview")}
          >
            <Icon name="box" />
            Preview
          </button>
          <button
            type="button"
            aria-pressed={mode === "code"}
            onClick={() => setMode("code")}
          >
            <Icon name="code" />
            Code
          </button>
        </div>
        <CopyButton
          value={code}
          label={`Copy ${name} code`}
          onCopyError={() => setMode("code")}
        />
      </div>
      {mode === "preview" ? children : <Code>{code}</Code>}
      <div className="showcase-example-note">
        <span className="showcase-status-dot" />
        {note}
        <span className="showcase-note-tag">
          {mode === "preview" ? "LIVE PREVIEW" : "TSX"}
        </span>
      </div>
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      className="showcase-switch-row"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
    >
      <span>{label}</span>
      <span className="showcase-switch-track">
        <span />
      </span>
    </button>
  );
}

function Props({
  name,
  rows,
}: {
  name: string;
  rows: [string, string, string][];
}) {
  return (
    <details className="showcase-props">
      <summary>
        Props reference<span>{rows.length} props</span>
      </summary>
      <div
        className="showcase-table-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${name} props reference`}
      >
        <table>
          <caption className="showcase-sr-only">
            Component props, types and defaults
          </caption>
          <thead>
            <tr>
              <th scope="col">Prop</th>
              <th scope="col">Type</th>
              <th scope="col">Default / behavior</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, type, description]) => (
              <tr key={name}>
                <th scope="row">
                  <code>{name}</code>
                </th>
                <td>
                  <code>{type}</code>
                </td>
                <td>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function SectionHeading({
  id,
  number,
  title,
  children,
  kind = "COMPONENT",
}: {
  id: string;
  number: string;
  title: string;
  children: ReactNode;
  kind?: string;
}) {
  return (
    <div className="showcase-section-heading">
      <div className="showcase-section-kicker">
        <span>{number}</span>
        {kind}
      </div>
      <h2 id={id}>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

function AccountCardSection() {
  const [currency, setCurrency] = useState<Currency>("GBP");
  const [visible, setVisible] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [footer, setFooter] = useState(true);
  const [status, setStatus] =
    useState<NonNullable<AccountCardProps["status"]>>("ready");
  const data = accounts[currency];
  const code = `import { AccountCard } from "@mmzaini/starling-react";\nimport "@mmzaini/starling-react/styles.css";\n\n<AccountCard\n  account={{ name: "${data.name}", currency: "${currency}" }}\n  balance={{ effectiveBalance: { currency: "${currency}", minorUnits: ${data.minorUnits} } }}\n  identifiers={${JSON.stringify(data.identifiers)}}\n  status="${status}"\n  masked={${!visible}}\n  hideBalance={${hideBalance}}\n${footer ? ">\n  <span>Main account · Includes pending outgoing payments</span>\n</AccountCard>" : "/>"}`;
  return (
    <section
      id="account-card"
      className="showcase-section"
      tabIndex={-1}
      aria-labelledby="account-card-title"
    >
      <SectionHeading id="account-card-title" number="01" title="AccountCard">
        A complete account overview. Balance, identifiers, and a place for the
        details that matter.
      </SectionHeading>
      <Example
        name="AccountCard"
        code={code}
        note="Fictional account data. No API connection."
      >
        <div className="showcase-playground">
          <div className="showcase-card-stage" id="accounts">
            <div className="showcase-stage-label">ACCOUNT OVERVIEW</div>
            <AccountCard
              account={{ name: data.name, currency }}
              balance={{
                effectiveBalance: { currency, minorUnits: data.minorUnits },
              }}
              identifiers={data.identifiers}
              status={status}
              masked={!visible}
              hideBalance={hideBalance}
            >
              {footer && (
                <span>Main account · Includes pending outgoing payments</span>
              )}
            </AccountCard>
            <span className="showcase-stage-caption">
              Default component styling
            </span>
          </div>
          <div className="showcase-controls">
            <div className="showcase-controls-heading">
              Playground<span>PROPS</span>
            </div>
            <label className="showcase-field">
              Account
              <select
                aria-label="Account"
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value as Currency)
                }
              >
                <option value="GBP">Everyday · GBP</option>
                <option value="EUR">Euro · EUR</option>
                <option value="USD">Dollar · USD</option>
              </select>
            </label>
            <label className="showcase-field">
              Status
              <select
                aria-label="Status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as typeof status)
                }
              >
                <option value="ready">Ready</option>
                <option value="loading">Loading</option>
                <option value="error">Error</option>
              </select>
            </label>
            <div className="showcase-control-divider" />
            <Switch
              label="Hide balance"
              checked={hideBalance}
              onChange={() => setHideBalance(!hideBalance)}
            />
            <Switch
              label="Show footer"
              checked={footer}
              onChange={() => setFooter(!footer)}
            />
            <button
              className="showcase-button showcase-reveal"
              type="button"
              aria-pressed={visible}
              aria-controls="accounts"
              onClick={() => setVisible(!visible)}
            >
              {visible ? "Hide" : "Show"} account details
            </button>
            <p className="showcase-control-hint">
              Change a prop. See it in the preview and the code.
            </p>
          </div>
        </div>
      </Example>
      <div className="showcase-subheading">
        <h3>Every state, accounted for</h3>
        <span>Built-in feedback</span>
      </div>
      <div className="showcase-state-grid">
        <div>
          <span className="showcase-sample-label">LOADING</span>
          <AccountCard title="Loading" status="loading" />
        </div>
        <div>
          <span className="showcase-sample-label">ERROR</span>
          <AccountCard title="Unavailable" status="error" />
        </div>
        <div>
          <span className="showcase-sample-label">MISSING DATA</span>
          <AccountCard title="No account data" />
        </div>
      </div>
      <Props
        name="AccountCard"
        rows={[
          [
            "account",
            "{ name?, currency? } | null",
            "Optional account display data",
          ],
          [
            "balance",
            "{ effectiveBalance?: Money } | null",
            "Missing balance displays an unavailable state",
          ],
          [
            "identifiers",
            "AccountIdentifiers | null",
            "Account number, sort code, IBAN and BIC",
          ],
          [
            "title",
            "string",
            "Overrides account.name; falls back to “Account”",
          ],
          ["status", '"ready" | "loading" | "error"', '"ready"'],
          ["masked", "boolean", "true — masks identifiers"],
          ["hideBalance", "boolean", "false"],
          ["locale", "string", '"en-GB"'],
          ["children", "ReactNode", "Optional footer content"],
          ["className", "string", "Optional additional CSS class"],
          ["style", "CSSProperties", "Optional inline styles"],
        ]}
      />
    </section>
  );
}

function BalanceSection() {
  const [currency, setCurrency] = useState("GBP");
  const [locale, setLocale] = useState("en-GB");
  const [masked, setMasked] = useState(false);
  const code = `import { Balance } from "@mmzaini/starling-react";\nimport "@mmzaini/starling-react/styles.css";\n\n<Balance\n  amount={{ currency: "${currency}", minorUnits: 248650 }}\n  label="Available balance"\n  locale="${locale}"\n  masked={${masked}}\n/>`;
  return (
    <section
      id="balance"
      className="showcase-section"
      tabIndex={-1}
      aria-labelledby="balance-title"
    >
      <SectionHeading id="balance-title" number="02" title="Balance">
        Money, clearly presented. Localized formatting with support for hidden
        and unavailable amounts.
      </SectionHeading>
      <Example
        name="Balance"
        code={code}
        note="Amounts are provided in integer minor units."
      >
        <div className="showcase-inline-controls">
          <label className="showcase-inline-field">
            Currency
            <select
              aria-label="Currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              <option>GBP</option>
              <option>EUR</option>
              <option>USD</option>
              <option>JPY</option>
              <option>KWD</option>
            </select>
          </label>
          <label className="showcase-inline-field">
            Locale
            <select
              aria-label="Locale"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
            >
              <option value="en-GB">en-GB</option>
              <option value="en-US">en-US</option>
              <option value="de-DE">de-DE</option>
              <option value="ja-JP">ja-JP</option>
            </select>
          </label>
          <Switch
            label="Mask amounts"
            checked={masked}
            onChange={() => setMasked(!masked)}
          />
        </div>
        <div className="showcase-balance-grid">
          <div>
            <span className="showcase-sample-label">STANDARD</span>
            <Balance
              amount={{ currency, minorUnits: 248650 }}
              label="Available balance"
              locale={locale}
              masked={masked}
            />
            <code>minorUnits: 248650</code>
          </div>
          <div>
            <span className="showcase-sample-label">NEGATIVE</span>
            <Balance
              amount={{ currency, minorUnits: -4250 }}
              label="Overdrawn balance"
              locale={locale}
              masked={masked}
            />
            <code>minorUnits: -4250</code>
          </div>
          <div>
            <span className="showcase-sample-label">ZERO</span>
            <Balance
              amount={{ currency, minorUnits: 0 }}
              label="Opening balance"
              locale={locale}
              masked={masked}
            />
            <code>minorUnits: 0</code>
          </div>
          <div>
            <span className="showcase-sample-label">UNAVAILABLE</span>
            <Balance
              label="Available balance"
              locale={locale}
              masked={masked}
            />
            <code>amount: undefined</code>
          </div>
        </div>
      </Example>
      <Props
        name="Balance"
        rows={[
          [
            "amount",
            "Money | null",
            "{ currency: string, minorUnits: number }; optional",
          ],
          ["label", "string", '"Balance"'],
          ["locale", "string", '"en-GB"'],
          ["masked", "boolean", "false"],
          ["className", "string", "Optional additional CSS class"],
        ]}
      />
    </section>
  );
}

function DetailsSection() {
  const [kind, setKind] = useState("domestic");
  const [masked, setMasked] = useState(true);
  const identifiers =
    kind === "domestic"
      ? domestic
      : kind === "international"
        ? international
        : undefined;
  const code = `import { AccountDetails } from "@mmzaini/starling-react";\nimport "@mmzaini/starling-react/styles.css";\n\n<AccountDetails\n  identifiers={${identifiers ? JSON.stringify(identifiers, null, 2).replaceAll("\n", "\n  ") : "undefined"}}\n  masked={${masked}}\n/>`;
  return (
    <section
      id="account-details"
      className="showcase-section"
      tabIndex={-1}
      aria-labelledby="details-title"
    >
      <SectionHeading id="details-title" number="03" title="AccountDetails">
        Just the identifiers. Use it on its own or compose it into your own
        account layout.
      </SectionHeading>
      <Example
        name="AccountDetails"
        code={code}
        note="Identifiers are masked by default."
      >
        <div className="showcase-inline-controls">
          <label className="showcase-inline-field">
            Identifiers
            <select
              aria-label="Identifiers"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="domestic">UK account</option>
              <option value="international">International</option>
              <option value="empty">Missing data</option>
            </select>
          </label>
          <button
            className="showcase-button showcase-details-toggle"
            type="button"
            aria-pressed={!masked}
            aria-controls="identifiers-preview"
            onClick={() => setMasked(!masked)}
          >
            {masked ? "Reveal" : "Mask"} identifiers
          </button>
        </div>
        <div className="showcase-details-stage">
          <div id="identifiers-preview" className="showcase-details-surface">
            <span className="showcase-sample-label">
              {kind === "international"
                ? "INTERNATIONAL DETAILS"
                : kind === "empty"
                  ? "MISSING DETAILS"
                  : "UK ACCOUNT DETAILS"}
            </span>
            <AccountDetails identifiers={identifiers} masked={masked} />
          </div>
          <div className="showcase-details-description">
            <h3>Private by default.</h3>
            <p>
              Only the last few characters are shown. Reveal the full value with
              the control above.
            </p>
            <p>
              Masking is visual only. Pass only data the current user is
              authorized to access.
            </p>
          </div>
        </div>
      </Example>
      <Props
        name="AccountDetails"
        rows={[
          [
            "identifiers",
            "AccountIdentifiers | null",
            "Optional accountIdentifier, bankIdentifier, iban and bic strings",
          ],
          ["masked", "boolean", "true"],
          ["className", "string", "Optional additional CSS class"],
        ]}
      />
    </section>
  );
}

function MoneySection() {
  const [minorUnits, setMinorUnits] = useState("12345");
  const [currency, setCurrency] = useState("GBP");
  const [locale, setLocale] = useState("en-GB");
  let result = "";
  let error = "";
  try {
    if (!minorUnits.trim())
      throw new Error("Enter an integer amount in minor units.");
    result = formatMoney({ currency, minorUnits: Number(minorUnits) }, locale);
  } catch {
    error =
      "Enter a safe integer, such as 12345. Decimals are not minor units.";
  }
  const code = error
    ? "// Enter a safe integer above to generate an example."
    : `import { formatMoney } from "@mmzaini/starling-react";\n\nformatMoney(\n  { currency: "${currency}", minorUnits: ${Number(minorUnits)} },\n  "${locale}"\n);`;
  return (
    <section
      id="format-money"
      className="showcase-section"
      tabIndex={-1}
      aria-labelledby="money-title"
    >
      <SectionHeading
        id="money-title"
        number="04"
        title="formatMoney"
        kind="UTILITY"
      >
        The formatter behind the components. Try currencies, locales, and
        amounts without floating-point division.
      </SectionHeading>
      <div className="showcase-money-tool">
        <div className="showcase-money-inputs">
          <label className="showcase-field">
            Minor units
            <input
              type="text"
              inputMode="numeric"
              value={minorUnits}
              aria-invalid={!!error}
              aria-describedby={error ? "money-error" : "money-hint"}
              onChange={(event) => setMinorUnits(event.target.value)}
            />
          </label>
          <label className="showcase-field">
            Currency
            <select
              aria-label="Currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              <option>GBP</option>
              <option>EUR</option>
              <option>USD</option>
              <option>JPY</option>
              <option>KWD</option>
            </select>
          </label>
          <label className="showcase-field">
            Locale
            <select
              aria-label="Locale"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
            >
              <option>en-GB</option>
              <option>en-US</option>
              <option>de-DE</option>
              <option>ja-JP</option>
            </select>
          </label>
        </div>
        <div className="showcase-money-result">
          <span className="showcase-sample-label">FORMATTED OUTPUT</span>
          <output aria-live="polite">{error ? "—" : result}</output>
          {error ? (
            <p id="money-error" role="alert">
              {error}
            </p>
          ) : (
            <p id="money-hint">
              {currency === "JPY"
                ? "JPY uses 0 fraction digits."
                : currency === "KWD"
                  ? "KWD uses 3 fraction digits."
                  : `100 minor units = 1 ${currency}.`}
            </p>
          )}
        </div>
      </div>
      <div className="showcase-code-block">
        <div className="showcase-code-heading">
          <span>TypeScript</span>
          <CopyButton value={code} />
        </div>
        <Code>{code}</Code>
      </div>
    </section>
  );
}

const installationCode = `import { AccountCard } from "@mmzaini/starling-react";\nimport "@mmzaini/starling-react/styles.css";\n\n// Fetch and authorize account data on your server.\nexport function AccountOverview({ account, balance, identifiers }) {\n  return (\n    <AccountCard\n      account={account}\n      balance={balance}\n      identifiers={identifiers}\n    />\n  );\n}`;

function App() {
  const [active, setActive] = useState(location.hash.slice(1) || "overview");
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const current = sections
          .filter(
            ({ id }) =>
              (document.getElementById(id)?.getBoundingClientRect().top ??
                Infinity) <= 150,
          )
          .at(-1);
        const atBottom =
          document.documentElement.scrollHeight > window.innerHeight &&
          Math.ceil(window.scrollY + window.innerHeight) >=
            document.documentElement.scrollHeight - 2;
        setActive(atBottom ? "installation" : (current?.id ?? "overview"));
      });
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("hashchange", update);
    update();
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("hashchange", update);
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        document.getElementById("showcase-menu-button")?.focus();
      }
    };
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest("#showcase-navigation, #showcase-menu-button")
      )
        setMenuOpen(false);
    };
    window.addEventListener("keydown", escape);
    window.addEventListener("pointerdown", dismiss);
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("pointerdown", dismiss);
    };
  }, [menuOpen]);
  return (
    <div className="showcase-app">
      <a className="showcase-skip" href="#overview">
        Skip to content
      </a>
      <header className="showcase-header">
        <a
          href="#overview"
          className="showcase-brand"
          aria-label="Starling React home"
        >
          <span>starling</span>
          <span className="showcase-brand-divider">/</span>
          <span className="showcase-brand-product">react</span>
        </a>
        <div className="showcase-header-right">
          <a
            className="showcase-repository"
            href={repository}
            target="_blank"
            rel="noreferrer"
          >
            GitHub
            <Icon name="arrow" />
          </a>
          <button
            id="showcase-menu-button"
            className="showcase-menu-button"
            type="button"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="showcase-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Icon name={menuOpen ? "close" : "menu"} size={20} />
          </button>
        </div>
      </header>
      <aside
        className={`showcase-sidebar ${menuOpen ? "is-open" : ""}`}
        id="showcase-navigation"
      >
        <nav aria-label="Component navigation">
          {sections.map((section) => (
            <div key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={active === section.id ? "location" : undefined}
                onClick={() => {
                  setActive(section.id);
                  setMenuOpen(false);
                  document
                    .getElementById(section.id)
                    ?.focus({ preventScroll: true });
                }}
              >
                {section.label}
                {section.number && <span>{section.number}</span>}
              </a>
            </div>
          ))}
        </nav>
      </aside>
      <main className="showcase-main">
        <section
          id="overview"
          className="showcase-overview"
          tabIndex={-1}
          aria-labelledby="overview-title"
        >
          <div className="showcase-breadcrumb">
            Documentation<span>/</span>
            <span>Overview</span>
          </div>
          <div className="showcase-overview-heading">
            <h1 id="overview-title">
              Account UI,
              <br />
              without the extra.
            </h1>
          </div>
          <p className="showcase-intro">
            Three focused React components for Starling account data.
            <br className="showcase-desktop-break" /> Explore the pieces, try
            the props, and make them part of your app.
          </p>
          <div className="showcase-overview-actions">
            <a
              className="showcase-button showcase-button-primary"
              href="#installation"
            >
              Get started<span aria-hidden="true">↗</span>
            </a>
            <a className="showcase-text-link" href="#account-card">
              Explore components<span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="showcase-overview-meta">
            <span>
              <Icon name="box" />3 components + 1 utility
            </span>
            <span>TypeScript</span>
            <span>SSR compatible</span>
            <span>Optional CSS</span>
          </div>
        </section>
        <AccountCardSection />
        <BalanceSection />
        <DetailsSection />
        <MoneySection />
        <section
          id="installation"
          className="showcase-section showcase-installation"
          tabIndex={-1}
          aria-labelledby="installation-title"
        >
          <SectionHeading
            id="installation-title"
            number="05"
            title="Make it yours"
            kind="GET STARTED"
          >
            Install the package, import the styles, and pass in your account
            data.
          </SectionHeading>
          <div className="showcase-install-command">
            <code>
              <span aria-hidden="true">$ </span>npm install
              @mmzaini/starling-react
            </code>
            <CopyButton
              value="npm install @mmzaini/starling-react"
              label="Copy install command"
            />
          </div>
          <div className="showcase-code-block">
            <div className="showcase-code-heading">
              <span>AccountOverview.jsx</span>
              <CopyButton value={installationCode} />
            </div>
            <Code>{installationCode}</Code>
          </div>
          <div className="showcase-install-notes">
            <div>
              <h3>Bring your data</h3>
              <p>
                Display-only components. Fetch data on your server with the
                Starling SDK or your own backend, then pass authorized display
                data as props.
              </p>
            </div>
            <div>
              <h3>Keep your own style</h3>
              <p>
                The stylesheet is optional. Import it once for the defaults
                shown here, or use the component classes with your own CSS.
              </p>
            </div>
          </div>
          <a
            className="showcase-text-link"
            href={`${repository}#readme`}
            target="_blank"
            rel="noreferrer"
          >
            Read the package documentation
            <Icon name="arrow" />
          </a>
        </section>
        <footer className="showcase-footer">
          <p>
            Community maintained. Not an official Starling Bank package.
            <br />
            All balances and account details on this page are fictional.
          </p>
          <a href="#overview">
            Back to top <span aria-hidden="true">↑</span>
          </a>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
