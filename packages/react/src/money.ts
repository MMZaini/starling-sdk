export interface Money {
  currency: string;
  minorUnits: number;
}

/** Format integer minor units without floating-point division or cent rounding. */
export function formatMoney(amount: Money, locale = "en-GB"): string {
  if (!Number.isSafeInteger(amount.minorUnits)) throw new RangeError("minorUnits must be a safe integer");
  if (!/^[A-Z]{3}$/.test(amount.currency)) throw new RangeError("currency must be an uppercase ISO currency code");
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: amount.currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits;
  if (digits === undefined) throw new RangeError("Could not determine the currency fraction digits");
  const units = BigInt(amount.minorUnits);
  const absolute = units < 0n ? -units : units;
  const divisor = 10n ** BigInt(digits);
  const whole = absolute / divisor;
  const signedWhole = units < 0n ? (whole === 0n ? -0 : -whole) : whole;
  const fraction = new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: Math.max(1, digits), maximumFractionDigits: 0 }).format(absolute % divisor);
  return formatter.formatToParts(signedWhole).map((part) => part.type === "fraction" ? fraction : part.value).join("");
}
