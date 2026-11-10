import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { coordinatesFromLink } = await import("@/lib/restaurants/location");
import { directionsUrl, isShortMapsLink, latLngFromText } from "@/lib/location/parse";

describe("business location from Google Maps links", () => {
  it("reads the place pin, the map centre, query links and pasted coordinates", () => {
    expect(latLngFromText("https://www.google.com/maps/place/Maquis/@12.3700,-1.5300,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d12.371428!4d-1.519660")).toEqual({ lat: 12.371428, lng: -1.51966 });
    expect(latLngFromText("https://www.google.com/maps/@12.3714,-1.5197,15z")).toEqual({ lat: 12.3714, lng: -1.5197 });
    expect(latLngFromText("https://maps.google.com/?q=11.1771,-4.2979")).toEqual({ lat: 11.1771, lng: -4.2979 });
    expect(latLngFromText("https://www.google.com/maps/search/?api=1&query=12.25%2C-2.36")).toEqual({ lat: 12.25, lng: -2.36 });
    expect(latLngFromText(" 12.371428, -1.519660 ")).toEqual({ lat: 12.371428, lng: -1.51966 });
  });
  it("refuses text without valid coordinates", () => {
    for (const bad of ["Avenue Kwame Nkrumah", "https://example.com/@999,5", "0,0", ""]) expect(latLngFromText(bad)).toBeNull();
  });
  it("recognises short share links and builds directions", () => {
    expect(isShortMapsLink("https://maps.app.goo.gl/AbCdEf123")).toBe(true);
    expect(isShortMapsLink("https://goo.gl/maps/xyz")).toBe(true);
    expect(isShortMapsLink("https://goo.gl/other")).toBe(false);
    expect(isShortMapsLink("http://maps.app.goo.gl/x")).toBe(false);
    expect(isShortMapsLink("https://evil.example/maps.app.goo.gl")).toBe(false);
    expect(directionsUrl({ lat: 12.37, lng: -1.52 })).toBe("https://www.google.com/maps/dir/?api=1&destination=12.37,-1.52");
  });
});

describe("resolving short Google Maps links", () => {
  const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

  it("follows Google redirects to the coordinates", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(redirect("https://www.google.com/maps/place/X/@12.3714,-1.5197,17z"));
    expect(await coordinatesFromLink("https://maps.app.goo.gl/AbC123")).toEqual({ lat: 12.3714, lng: -1.5197 });
    spy.mockRestore();
  });
  it("never follows a redirect off Google", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(redirect("https://evil.example/@12.3714,-1.5197"));
    expect(await coordinatesFromLink("https://maps.app.goo.gl/AbC123")).toBeNull();
    spy.mockRestore();
  });
  it("does not fetch links that are not Google short links", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await coordinatesFromLink("https://example.com/somewhere")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
