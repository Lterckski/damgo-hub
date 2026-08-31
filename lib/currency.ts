/**
 * All money in Damgo Hub is Philippine Pesos (PHP), stored as integer
 * centavos — never a float. See 07-financial-tracker.md's Currency section
 * and architecture-context.md invariant 8. Every amount shown anywhere in
 * the app goes through formatPHP(), not an ad-hoc toLocaleString() call.
 */

const PHP_FORMATTER = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Renders an integer centavos amount as "₱1,250.00". */
export function formatPHP(centavos: number): string {
  return PHP_FORMATTER.format(centavos / 100);
}

/** Converts a peso amount (e.g. from a form input) to integer centavos. */
export function pesosToCentavos(pesos: number): number {
  return Math.round(pesos * 100);
}
