import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { openingHours, restaurants } from "@/db/schema";
import { FEATURE_FLAGS } from "@/db/schema";
import {
  saveAppearanceAction,
  saveContactsAction,
  saveFeaturesAction,
  saveHoursAction,
  saveProfileAction,
  saveServiceAction,
  setPublishedAction,
} from "@/app/app/settings/actions";
import { env } from "@/lib/env";
import { formatBfPhone } from "@/lib/format";
import { SEATING_MODES } from "@/lib/restaurants/settings";
import { BrandingEditor } from "./branding-editor";
import { LocationField } from "./location-field";
import { SettingsForm } from "./settings-form";

type Restaurant = typeof restaurants.$inferSelect;
type Hours = Array<typeof openingHours.$inferSelect>;

const input = "min-h-11 w-full rounded-lg border border-border bg-surface px-3";
const label = "mb-1 block text-sm font-semibold";
const phone = (v: string | null | undefined) => (v ? formatBfPhone(v) : "");

type SectionProps = { r: Restaurant; next?: string; submitLabel?: string };

export async function ProfileSection({ r, next, submitLabel }: SectionProps) {
  const t = await getTranslations("settings.profile");
  return (
    <SettingsForm action={saveProfileAction} next={next} submitLabel={submitLabel} testId="profile-form">
      <label>
        <span className={label}>{t("name")}</span>
        <input name="name" defaultValue={r.name} required minLength={2} maxLength={80} className={input} />
      </label>
      <label>
        <span className={label}>{t("slug")}</span>
        <input name="slug" defaultValue={r.slug} required maxLength={48} pattern="[a-z0-9-]+" className={input} autoCapitalize="none" />
        <span className="mt-1 block text-xs text-muted-foreground">{t("slugHint", { url: `${env.appUrl().replace(/^https?:\/\//, "")}/r/${r.slug}` })}</span>
      </label>
      <fieldset className="grid gap-2">
        <legend className={label}>{t("description")}</legend>
        <input name="description_fr" defaultValue={r.description?.fr ?? ""} maxLength={240} placeholder={t("descriptionPlaceholder")} aria-label={`${t("description")} FR`} className={input} />
        <input name="description_en" defaultValue={r.description?.en ?? ""} maxLength={240} placeholder="EN" aria-label={`${t("description")} EN`} className={input} />
        <input name="description_zh" defaultValue={r.description?.zh ?? ""} maxLength={240} placeholder="中文" aria-label={`${t("description")} ZH`} className={input} />
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={label}>{t("city")}</span>
          <input name="city" defaultValue={r.city} required maxLength={60} list="bf-cities" className={input} />
          <datalist id="bf-cities">
            {["Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Ouahigouya", "Banfora", "Kaya", "Tenkodogo", "Fada N’Gourma"].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label>
          <span className={label}>{t("address")}</span>
          <input name="address" defaultValue={r.address ?? ""} maxLength={200} placeholder={t("addressPlaceholder")} className={input} />
        </label>
      </div>
    </SettingsForm>
  );
}

/** Business location: GPS on site or a Google Maps link (outside the profile form: saved on its own). */
export function LocationSection({ r }: { r: Restaurant }) {
  return (
    <LocationField
      initial={r.latitude != null && r.longitude != null ? { lat: r.latitude, lng: r.longitude, source: r.locationSource, accuracyM: r.locationAccuracyM } : null}
    />
  );
}

export async function ContactsSection({ r, next, submitLabel }: SectionProps) {
  const t = await getTranslations("settings.contacts");
  return (
    <SettingsForm action={saveContactsAction} next={next} submitLabel={submitLabel} testId="contacts-form">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className={label}>{t("phones")}</legend>
        {[0, 1, 2].map((i) => (
          <input key={i} name={`phone${i + 1}`} type="tel" inputMode="tel" defaultValue={phone(r.phones[i])} placeholder="+226 70 00 00 00" aria-label={t("phone", { n: i + 1 })} className={input} />
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className={label}>{t("whatsapp")}</span>
          <input name="whatsapp" type="tel" inputMode="tel" defaultValue={phone(r.whatsapp)} className={input} />
        </label>
        <label>
          <span className={label}>{t("orangeMoney")}</span>
          <input name="orangeMoney" type="tel" inputMode="tel" defaultValue={phone(r.orangeMoney)} className={input} />
        </label>
        <label>
          <span className={label}>{t("moovMoney")}</span>
          <input name="moovMoney" type="tel" inputMode="tel" defaultValue={phone(r.moovMoney)} className={input} />
        </label>
      </div>
    </SettingsForm>
  );
}

export async function HoursSection({ hours, next, submitLabel }: { hours: Hours; next?: string; submitLabel?: string }) {
  const t = await getTranslations("settings.hours");
  const days = t.raw("days") as string[];
  // Monday first, like a printed timetable.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <SettingsForm action={saveHoursAction} next={next} submitLabel={submitLabel} testId="hours-form">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {order.map((d) => {
          const h = hours.find((x) => x.weekday === d);
          return (
            <div key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2">
              <span className="w-24 font-semibold">{days[d]}</span>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name={`open_${d}`} defaultChecked={Boolean(h) || hours.length === 0} className="h-5 w-5 shrink-0" />
                {t("open")}
              </label>
              <span className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-sm">
                  <span className="sr-only">{t("opens")}</span>
                  <input type="time" name={`opens_${d}`} defaultValue={h?.opens.slice(0, 5) ?? "10:00"} className="min-h-11 w-[7.5rem] rounded-lg border border-border bg-surface px-2" />
                </label>
                <span aria-hidden>–</span>
                <label className="flex items-center gap-1 text-sm">
                  <span className="sr-only">{t("closes")}</span>
                  <input type="time" name={`closes_${d}`} defaultValue={h?.closes.slice(0, 5) ?? "23:00"} className="min-h-11 w-[7.5rem] rounded-lg border border-border bg-surface px-2" />
                </label>
              </span>
            </div>
          );
        })}
      </div>
    </SettingsForm>
  );
}

export async function ServiceSection({ r, next, submitLabel, askTableCount }: SectionProps & { askTableCount?: boolean }) {
  const t = await getTranslations("settings.service");
  const s = r.settings;
  const modes = s.seatingModes ?? ["table", "takeaway"];
  const locales = s.enabledLocales ?? ["fr", "en", "zh"];
  const opt = "flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm has-checked:border-primary has-checked:bg-muted";
  return (
    <SettingsForm action={saveServiceAction} next={next} submitLabel={submitLabel} testId="service-form">
      <fieldset>
        <legend className={label}>{t("seating")}</legend>
        <p className="mb-2 text-xs text-muted-foreground">{t("seatingHint")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SEATING_MODES.map((m) => (
            <label key={m} className={opt}>
              <input type="checkbox" name="seatingModes" value={m} defaultChecked={modes.includes(m)} className="h-5 w-5 shrink-0" />
              {t(`modes.${m}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {askTableCount && (
        <label className="text-sm">
          <span className={label}>{t("tableCount")}</span>
          <input type="number" name="tableCount" min={0} max={200} step={1} defaultValue={10} inputMode="numeric" className={input + " max-w-32"} data-testid="table-count" />
          <span className="mt-1 block text-xs text-muted-foreground">{t("tableCountHint")}</span>
        </label>
      )}
      <fieldset>
        <legend className={label}>{t("qr")}</legend>
        <div className="grid gap-2">
          <label className={opt}>
            <input type="radio" name="qrStrategy" value="per_seat" defaultChecked={(s.qrStrategy ?? "per_seat") === "per_seat"} className="h-5 w-5 shrink-0" />
            {t("qrPerSeat")}
          </label>
          <label className={opt}>
            <input type="radio" name="qrStrategy" value="generic" defaultChecked={s.qrStrategy === "generic"} className="h-5 w-5 shrink-0" />
            {t("qrGeneric")}
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend className={label}>{t("validation")}</legend>
        <div className="grid gap-2">
          <label className={opt}>
            <input type="radio" name="orderValidation" value="server_confirms" defaultChecked={(s.orderValidation ?? "server_confirms") === "server_confirms"} className="h-5 w-5 shrink-0" />
            {t("serverConfirms")}
          </label>
          <label className={opt}>
            <input type="radio" name="orderValidation" value="direct" defaultChecked={s.orderValidation === "direct"} className="h-5 w-5 shrink-0" />
            {t("direct")}
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend className={label}>{t("languages")}</legend>
        <div className="flex flex-wrap gap-2">
          {[
            ["fr", "Français"],
            ["en", "English"],
            ["zh", "中文"],
          ].map(([code, name]) => (
            <label key={code} className={opt}>
              <input type="checkbox" name="enabledLocales" value={code} defaultChecked={code === "fr" || locales.includes(code!)} disabled={code === "fr"} className="h-5 w-5 shrink-0" />
              {name}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("languagesHint")}</p>
      </fieldset>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className={label}>{t("inactivity")}</legend>
        <label className="text-sm">
          <span className="mb-1 block">{t("warnAfterMin")}</span>
          <input type="number" name="warnAfterMin" min={1} max={60} step={1} defaultValue={Math.round((s.inactivity?.warnAfterSec ?? 240) / 60)} className={input} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">{t("releaseAfterSec")}</span>
          <input type="number" name="releaseAfterSec" min={10} max={600} step={5} defaultValue={s.inactivity?.releaseAfterSec ?? 30} className={input} />
        </label>
      </fieldset>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className={label}>{t("delays")}</legend>
        <label className="text-sm">
          <span className="mb-1 block">{t("warnMin")}</span>
          <input type="number" name="warnMin" min={1} max={120} step={1} defaultValue={s.serviceDelays?.warnMin ?? 10} className={input} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">{t("lateMin")}</span>
          <input type="number" name="lateMin" min={2} max={240} step={1} defaultValue={s.serviceDelays?.lateMin ?? 20} className={input} />
        </label>
      </fieldset>
    </SettingsForm>
  );
}

export async function AppearanceSection({ r, next, submitLabel }: SectionProps) {
  return (
    <SettingsForm action={saveAppearanceAction} next={next} submitLabel={submitLabel} testId="appearance-form">
      <BrandingEditor name={r.name} initial={{ logoUrl: r.logoUrl, coverUrl: r.coverUrl, accentColor: r.accentColor, theme: r.theme }} />
    </SettingsForm>
  );
}

export async function FeaturesSection({ r }: SectionProps) {
  const t = await getTranslations("settings.features");
  const f = r.settings.features ?? {};
  const defaults: Record<(typeof FEATURE_FLAGS)[number], boolean> = { welcomeScreen: true, fortuneCookie: true, share: true, takeawayWhatsapp: true, localBadge: false, attendance: true };
  return (
    <SettingsForm action={saveFeaturesAction} testId="features-form">
      {FEATURE_FLAGS.map((flag) => (
        <label key={flag} className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name={flag} defaultChecked={f[flag] ?? defaults[flag]} className="h-5 w-5 shrink-0" />
          {t(flag)}
        </label>
      ))}
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="poweredBadge" defaultChecked={r.poweredBadge} className="h-5 w-5 shrink-0" />
        <span>
          {t("poweredBadge")}
          <span className="block text-xs text-muted-foreground">{t("poweredBadgeHint")}</span>
        </span>
      </label>
    </SettingsForm>
  );
}

export async function PublishSection({ r }: SectionProps) {
  const t = await getTranslations("settings.publish");
  return (
    <div className="flex flex-col gap-3" data-testid="publish-section">
      <p className={r.published ? "font-semibold text-vert" : "text-muted-foreground"} data-testid="publish-status">
        {r.published ? `● ${t("published")}` : t("unpublished")}
      </p>
      <div className="flex flex-wrap items-start gap-3">
        <SettingsForm action={setPublishedAction} submitLabel={r.published ? t("unpublish") : t("publish")}>
          <input type="hidden" name="published" value={r.published ? "0" : "1"} />
        </SettingsForm>
        <Link href={`/r/${r.slug}`} target="_blank" className="flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted">
          {r.published ? t("open") : t("preview")} ↗
        </Link>
      </div>
    </div>
  );
}
