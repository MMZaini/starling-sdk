import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountCard, AccountDetails, Balance, formatMoney } from "../src/index.js";
import type { Starling } from "../../../sdks/typescript/dist/index.js";

const account: Starling.AccountV2 = { name: "Main account", currency: "GBP" };
const balance: Starling.BalanceV2 = { effectiveBalance: { currency: "GBP", minorUnits: 12345 } };
const identifiers: Starling.AccountIdentifiers = { accountIdentifier: "12345678", bankIdentifier: "040004", iban: "GB72SRLG60837112345678", bic: "SRLGGB2L" };

test("renders SDK-shaped data while masking identifiers by default", () => {
  const html = renderToStaticMarkup(<AccountCard account={account} balance={balance} identifiers={identifiers} />);
  assert(html.includes("Main account"));
  assert(html.includes("£123.45"));
  for (const value of Object.values(identifiers)) assert(!html.includes(String(value)));
  assert(html.includes("ending 5678"));
});

test("reveals identifiers only when requested and never reveals very short masked values", () => {
  const html = renderToStaticMarkup(<AccountDetails identifiers={identifiers} masked={false} />);
  assert(html.includes("12345678") && html.includes("04-00-04"));
  const short = renderToStaticMarkup(<AccountDetails identifiers={{ accountIdentifier: "123" }} />);
  assert(!short.includes("123"));
});

test("hides data in loading, error and masked-balance states", () => {
  for (const status of ["loading", "error"] as const) {
    const html = renderToStaticMarkup(<AccountCard account={account} balance={balance} identifiers={identifiers} status={status} />);
    assert(!html.includes("12345678") && !html.includes("123.45"));
    assert(html.includes(status === "loading" ? 'role="status"' : 'role="alert"'));
  }
  const masked = renderToStaticMarkup(<Balance amount={balance.effectiveBalance} masked />);
  assert(masked.includes("hidden") && !masked.includes("123.45"));
});

test("handles absent data and renders text without interpreting HTML", () => {
  const missing = renderToStaticMarkup(<AccountCard />);
  assert(missing.includes("unavailable"));
  const escaped = renderToStaticMarkup(<AccountCard title={'<img src=x onerror="bad">'} />);
  assert(!escaped.includes("<img"));
  assert(escaped.includes("&lt;img"));
});

test("formats exact minor units, including negative fractional and maximum safe values", () => {
  assert.equal(formatMoney({ currency: "GBP", minorUnits: 12345 }), "£123.45");
  assert.equal(formatMoney({ currency: "GBP", minorUnits: -1 }), "-£0.01");
  assert.equal(formatMoney({ currency: "GBP", minorUnits: Number.MAX_SAFE_INTEGER }), "£90,071,992,547,409.91");
  assert.equal(formatMoney({ currency: "EUR", minorUnits: 1234 }, "de-DE"), "12,34\u00a0€");
  assert.equal(formatMoney({ currency: "JPY", minorUnits: 1234 }), "JP¥1,234");
  assert.equal(formatMoney({ currency: "KWD", minorUnits: 1234 }), "KWD\u00a01.234");
});

test("rejects amounts that cannot be displayed accurately", () => {
  for (const minorUnits of [0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => formatMoney({ currency: "GBP", minorUnits }), RangeError);
    assert(renderToStaticMarkup(<Balance amount={{ currency: "GBP", minorUnits }} />).includes("unavailable"));
  }
});
