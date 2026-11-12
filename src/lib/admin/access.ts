/**
 * What each person in the TIBLOGICS console may do. Owners (SUPERADMIN_EMAILS) have everything;
 * collaborators have the permissions an owner (or someone with « team ») gave them.
 */
export const ADMIN_PERMS = [
  "dashboard",
  "businesses.read",
  "businesses.write",
  "billing.read",
  "billing.write",
  "support",
  "recovery",
  "comms",
  "activity",
  "settings",
  "team",
] as const;
export type AdminPerm = (typeof ADMIN_PERMS)[number];

/** Permissions only an owner may hand out (they let someone give themselves more). */
export const OWNER_ONLY_PERMS: ReadonlySet<AdminPerm> = new Set(["team", "settings"]);

/** Ready-made sets for the « add a collaborator » form. */
export const PERM_PRESETS: Record<string, AdminPerm[]> = {
  support: ["dashboard", "businesses.read", "support", "recovery"],
  sales: ["dashboard", "businesses.read", "businesses.write", "billing.read", "billing.write", "comms"],
  analyst: ["dashboard", "businesses.read", "billing.read", "activity"],
  manager: ["dashboard", "businesses.read", "businesses.write", "billing.read", "billing.write", "support", "recovery", "comms", "activity"],
};

/** Some permissions only make sense with another (writing businesses needs reading them…). */
const IMPLIES: Partial<Record<AdminPerm, AdminPerm[]>> = {
  "businesses.write": ["businesses.read"],
  "billing.write": ["billing.read", "businesses.read"],
  recovery: ["businesses.read", "support"],
  support: ["businesses.read"],
  comms: ["businesses.read"],
};

export function normalizePerms(input: readonly string[]): AdminPerm[] {
  const set = new Set<AdminPerm>();
  const add = (p: AdminPerm) => {
    if (set.has(p)) return;
    set.add(p);
    for (const q of IMPLIES[p] ?? []) add(q);
  };
  for (const p of input) if ((ADMIN_PERMS as readonly string[]).includes(p)) add(p as AdminPerm);
  return ADMIN_PERMS.filter((p) => set.has(p));
}

export type AdminAccess = { owner: boolean; perms: ReadonlySet<AdminPerm> };

export function hasPerm(a: AdminAccess, p: AdminPerm): boolean {
  return a.owner || a.perms.has(p);
}

/** Which console page needs which permission (the nav only shows what the person may open). */
export const PAGE_PERM: Record<string, AdminPerm | null> = {
  "/admin_pro": null,
  "/admin_pro/live": "dashboard",
  "/admin_pro/businesses": "businesses.read",
  "/admin_pro/billing": "billing.read",
  "/admin_pro/map": "businesses.read",
  "/admin_pro/support": "support",
  "/admin_pro/recovery": "recovery",
  "/admin_pro/messages": "comms",
  "/admin_pro/activity": "activity",
  "/admin_pro/team": "team",
  "/admin_pro/settings": "settings",
};
