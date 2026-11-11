/**
 * Seats one group occupies and shares a bill at: numbered tables and private rooms. A named
 * area (« Terrasse »), the counter, takeaway and delivery hold several unrelated customers:
 * never « occupied », never « joined », never a shared bill.
 */
export const GROUP_SEATS: ReadonlySet<string> = new Set(["table", "room"]);
