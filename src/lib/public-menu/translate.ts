/**
 * Tiny message formatter for the public menu (keeps next-intl's client runtime off the
 * customer's phone). Supports {var} and "{count, plural, one {...} other {...}}".
 */
export type Messages = Record<string, unknown>;

export function format(template: string, vars: Record<string, string | number> = {}): string {
  const plural = /\{(\w+), plural, ((?:\w+|=\d+) \{[^}]*\}\s*)+\}/g;
  let out = template.replace(plural, (match, name: string) => {
    const n = Number(vars[name] ?? 0);
    const cases = Object.fromEntries([...match.matchAll(/(\w+|=\d+) \{([^}]*)\}/g)].map((m) => [m[1]!, m[2]!]));
    const chosen = cases[`=${n}`] ?? (n === 1 && cases.one !== undefined ? cases.one : cases.other) ?? "";
    return chosen.replace(/#/g, String(n));
  });
  out = out.replace(/\{(\w+)\}/g, (_m, k: string) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
  return out;
}

export function makeT(messages: Messages) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const v = messages[key];
    return typeof v === "string" ? format(v, vars) : key;
  };
}
