import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** restocool.com/c/AB3K9 → same as typing the code on /c. */
export default async function CodeShortLink({ params }: { params: Promise<{ code: string }> }) {
  redirect(`/c?code=${encodeURIComponent((await params).code.slice(0, 20))}`);
}
