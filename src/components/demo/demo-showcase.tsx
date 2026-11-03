import QRCode from "qrcode";
import { getTranslations } from "next-intl/server";
import { formatFCFA } from "@/lib/format";
import { DemoAnimation, type DemoStrings } from "./demo-animation";

/** Real, scannable QR codes rendered on the server (no QR library shipped to the browser). */
async function qrSvg(text: string, dark: string, light: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark, light } });
}

/**
 * Animated walkthrough of the Restaurant Démo: scan the table QR, build a selection,
 * "Montrer au serveur", the server scans the order QR, order served.
 */
export async function DemoShowcase({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const t = await getTranslations("demo");
  const [tableQr, orderQr] = await Promise.all([
    qrSvg("https://restocool.com/r/restaurant-demo?t=demo-table-7", "#17231C", "#FFFFFF"),
    qrSvg("RESTOCOOL:ORDER:A-27:TABLE-7", "#17231C", "#FFFFFF"),
  ]);

  const s: DemoStrings = {
    customer: t("customer"),
    server: t("server"),
    play: t("play"),
    pause: t("pause"),
    prev: t("prev"),
    next: t("next"),
    chapters: [t("chapters.scan"), t("chapters.choose"), t("chapters.show"), t("chapters.serverScan"), t("chapters.served")],
    ui: {
      scanHint: t("ui.scanHint"),
      tableDetected: t("ui.tableDetected"),
      restaurant: t("ui.restaurant"),
      tabs: [t("ui.tabs.0"), t("ui.tabs.1"), t("ui.tabs.2")],
      chooseVariant: t("ui.chooseVariant"),
      half: t("ui.half"),
      whole: t("ui.whole"),
      mySelection: t("ui.mySelection"),
      itemsByCount: [0, 1, 2, 3].map((count) => t("ui.items", { count })),
      showServer: t("ui.showServer"),
      table: t("ui.table"),
      orderNo: t("ui.orderNo"),
      scanOrder: t("ui.scanOrder"),
      newOrder: t("ui.newOrder"),
      confirm: t("ui.confirm"),
      confirmed: t("ui.confirmed"),
      statuses: [t("ui.statusSent"), t("ui.statusConfirmed"), t("ui.statusPreparing"), t("ui.statusReady"), t("ui.statusServed")],
      served: t("ui.served"),
      total: t("ui.total"),
    },
    dishes: { chicken: t("dishes.chicken"), rice: t("dishes.rice"), bissap: t("dishes.bissap") },
    prices: {
      chickenHalf: formatFCFA(3500)!,
      chickenWhole: formatFCFA(6500)!,
      rice: formatFCFA(2500)!,
      bissap: formatFCFA(500)!,
      bissapTwo: formatFCFA(1000)!,
      totals: [formatFCFA(0)!, formatFCFA(6500)!, formatFCFA(7000)!, formatFCFA(7500)!],
    },
  };

  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <section aria-labelledby="demo-title" className="mx-auto w-full max-w-5xl px-4 py-12">
      <Heading id="demo-title" className="text-center text-3xl font-extrabold md:text-4xl">
        {t("title")}
      </Heading>
      <p className="mt-2 mb-8 text-center text-muted-foreground">{t("subtitle")}</p>
      <DemoAnimation s={s} tableQr={tableQr} orderQr={orderQr} />
    </section>
  );
}
