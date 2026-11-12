/** Coarse device facts from the User-Agent (no fingerprinting: three device types, a few systems). */
export type Device = "phone" | "tablet" | "desktop";
export type Os = "android" | "ios" | "windows" | "mac" | "linux" | "other";

export function deviceFromUa(ua: string | null | undefined, hint?: { touch?: boolean; width?: number }): { device: Device; os: Os } {
  const u = (ua ?? "").toLowerCase();
  const os: Os = /android/.test(u) ? "android" : /iphone|ipad|ipod/.test(u) ? "ios" : /windows/.test(u) ? "windows" : /mac os x|macintosh/.test(u) ? "mac" : /linux|cros/.test(u) ? "linux" : "other";
  let device: Device = "desktop";
  if (/ipad|tablet|kindle|silk|playbook/.test(u) || (/android/.test(u) && !/mobile/.test(u))) device = "tablet";
  else if (/mobi|iphone|ipod|android|phone/.test(u)) device = "phone";
  // iPadOS says « Macintosh »: a Mac with a touch screen is an iPad.
  if (os === "mac" && hint?.touch) return { device: "tablet", os: "ios" };
  return { device, os };
}
