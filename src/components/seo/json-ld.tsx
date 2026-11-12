import { serializeJsonLd, type JsonLd as Data } from "@/lib/seo/json-ld";

/** Server-rendered structured data (no client JS). The content is escaped by serializeJsonLd. */
export function JsonLd({ data }: { data: Data | Data[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
