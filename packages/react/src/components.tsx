import type { CSSProperties, ReactNode } from "react";
import { formatMoney, type Money } from "./money.js";

export interface AccountIdentifiers {
  accountIdentifier?: string;
  bankIdentifier?: string;
  iban?: string;
  bic?: string;
}

export interface BalanceProps {
  amount?: Money | null;
  label?: string;
  locale?: string;
  masked?: boolean;
  className?: string;
}

export function Balance({ amount, label = "Balance", locale = "en-GB", masked = false, className = "" }: BalanceProps) {
  let formatted: string | undefined;
  if (amount && !masked) {
    try { formatted = formatMoney(amount, locale); }
    catch (error) { if (!(error instanceof RangeError)) throw error; }
  }
  return <div className={`starling-balance ${className}`}>
    <p className="starling-label">{label}</p>
    <p className="starling-balance-value" aria-label={masked ? `${label} hidden` : formatted ? `${label}: ${formatted}` : `${label} unavailable`}>
      {masked ? "••••" : formatted ?? "—"}
    </p>
  </div>;
}

export interface AccountDetailsProps {
  identifiers?: AccountIdentifiers | null;
  /** Visual masking only. Full values must still be authorized for this user. */
  masked?: boolean;
  className?: string;
}

export function AccountDetails({ identifiers, masked = true, className = "" }: AccountDetailsProps) {
  const rows = [
    ["Account number", identifiers?.accountIdentifier],
    ["Sort code", identifiers?.bankIdentifier],
    ["IBAN", identifiers?.iban],
    ["BIC", identifiers?.bic],
  ].filter((row): row is [string, string] => typeof row[1] === "string" && row[1].trim().length > 0);
  if (!rows.length) return <p className={`starling-empty ${className}`}>Account details unavailable</p>;
  return <dl className={`starling-details ${className}`}>
    {rows.map(([label, value]) => {
      const compact = value.replace(/\s+/g, "");
      const tail = compact.slice(-Math.min(4, Math.max(0, compact.length - 4)));
      const visibleTail = compact.length > 4 ? tail : "";
      const display = masked ? `••••${visibleTail}` : label === "Sort code" && /^\d{6}$/.test(compact) ? compact.match(/.{2}/g)!.join("-") : value;
      return <div className="starling-detail" key={label}>
        <dt>{label}</dt>
        <dd aria-label={masked ? `${label} hidden${visibleTail ? `, ending ${visibleTail}` : ""}` : undefined}>{display}</dd>
      </div>;
    })}
  </dl>;
}

export interface AccountCardProps {
  account?: { name?: string; currency?: string } | null;
  balance?: { effectiveBalance?: Money } | null;
  identifiers?: AccountIdentifiers | null;
  title?: string;
  status?: "ready" | "loading" | "error";
  masked?: boolean;
  hideBalance?: boolean;
  locale?: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Display-only account summary. Fetch and authorize its data on your server. */
export function AccountCard({ account, balance, identifiers, title, status = "ready", masked = true, hideBalance = false, locale = "en-GB", children, className = "", style }: AccountCardProps) {
  return <section className={`starling-card ${className}`} style={style} aria-label={title ?? account?.name ?? "Account"} aria-busy={status === "loading"}>
    <header className="starling-card-header">
      <h2>{title ?? account?.name ?? "Account"}</h2>
      {status === "ready" && account?.currency && <span className="starling-currency">{account.currency}</span>}
    </header>
    {status === "loading" ? <p className="starling-state" role="status">Loading account…</p>
      : status === "error" ? <p className="starling-state" role="alert">Unable to load this account.</p>
        : <>
          <Balance amount={balance?.effectiveBalance} label="Effective balance" locale={locale} masked={hideBalance} />
          <AccountDetails identifiers={identifiers} masked={masked} />
          {children && <footer className="starling-card-footer">{children}</footer>}
        </>}
  </section>;
}
