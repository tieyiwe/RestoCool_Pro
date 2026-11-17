# 2. Features list

**Status:**

- **Live:** available today.
- **Coming:** planned, not built yet. Never promise a « Coming » feature as available.

**Plans:** G = Gratuit, P = Pro, B = Business. During the launch offer, every new business has Pro for free, and reservations are open on every plan.

## For customers (public page `/r/<name>`)

| Feature | Plans | Status |
|---|---|---|
| Digital menu with categories, search (FR/EN/ZH), photos that enlarge and swipe, « Nouveau » badges, spicy filter, prices in FCFA, « Sur demande » prices | G P B | Live |
| French by default on every visit; English and Chinese; dish names shown in the other languages for staff | G P B | Live |
| Welcome screen, share button, fortune cookie, « 100 % local » tags, low-data mode (no photos) | G P B | Live |
| Contact section: tap to call, WhatsApp, Orange Money / Moov numbers, address, directions, « Ouvert / Fermé » | G P B | Live |
| Takeaway order by WhatsApp (prefilled message) | G P B | Live |
| Menu works offline after the first visit; page installs like an app; updates itself | G P B | Live |
| Open the menu by QR code, or by typing the numéro RC at `restocool.com/c` | G P B | Live |
| « Ma sélection » cart with variants, options and notes (« sans piment ») | P B | Live |
| Choose a place: table / private room / area / counter / takeaway / delivery; table QR places you automatically; « déjà prise » warning | P B | Live |
| « Confirmer la commande »: order sent to the business; live tracking (« En attente de l'établissement » → … → « Servie ») with confetti when served | P B | Live |
| Group ordering: several phones at one table share one bill | P B | Live |
| « Partager ma sélection avec ma table »: friends add their dishes by link (name first); one order with each person's name on their dishes; only the person who started confirms | P B | Live |
| « Montrer au serveur »: full-screen order with a QR the staff scan | P B | Live |
| Takeaway on the platform: name, phone, pickup time | P B | Live |
| Orders confirmed without network wait on the phone and leave by themselves | P B | Live |
| « Réserver une table »: day, time, guests, name, email, phone, note; email from RestoCool with a private link to see or cancel | P B (all plans during the launch offer) | Live |
| Confirmed reservation: email with a one-time arrival QR | P B | Live |
| « Attente actuelle : environ 45 min » shown on busy days | P B | Live |
| Reviews: 1–5 stars and a comment after being served; stars next to the business name | P B | Live |
| Business offers and dish promotions (« Offres du moment ») | B | Live |
| Pay online from the phone (« Payer maintenant ») | – | Coming (the plumbing is ready; a provider must be connected) |
| Loyalty card | – | Coming |

## For the business (app `/app`)

### Setting up

| Feature | Plans | Status |
|---|---|---|
| Create a business; name availability check with suggestions | G P B | Live |
| 6-step setup wizard: « Votre établissement », « Profil », « Contacts », « Horaires », « Service et tables », « Image de marque » | G P B | Live |
| Menu manager: categories (with time windows), dishes in FR/EN/ZH with « Suggérer » translations, variants, options, spice level, tags, kitchen station, photos compressed on the phone, duplicate a dish | G P B (Gratuit: up to 40 dishes) | Live |
| « Épuisé aujourd'hui » in one tap, shown live to customers | G P B | Live |
| Brand: logo, cover photo, 3 themes, 16 colour palettes, accent colour; « Personnalisez votre page » guide | G P B | Live |
| Business location by GPS or Google Maps link | G P B | Live |
| Publish / unpublish; owner preview | G P B | Live |
| Main QR + numéro RC, downloadable sticker « Scannez-moi · Scan me » | G P B | Live |
| QR per table and private room, printable A4 kits | P B | Live |
| Daily special banner (« Plat du jour »), menu CSV import/export, change prices by percentage | – | Coming |

### Service

| Feature | Plans | Status |
|---|---|---|
| Front desk board (« Service »): orders by status, oldest first, seat badges, timers, sound | P B | Live |
| Kitchen screen by station: tap a dish or « Tout est prêt » | P B | Live |
| Validation mode: « Direct » (straight to the kitchen) or the server confirms first | P B | Live |
| « Table libérée » after service; « Salle en direct » floor plan (free / taken / eating / ready…) | P B | Live |
| Tables free themselves when abandoned; orders nobody picked up close after 2 h (« Non prise en charge ») | P B | Live |
| Scanner in the app: customer order QR, reservation QR, numéro RC | P B | Live |
| Staff actions work offline (« ⏳ en attente ») and sync when the network returns | P B | Live |
| Order history with filters and CSV export | P B | Live |
| Orders show « Payée » to the customer when the bill is settled | P B | Live |
| Staff take an order for a customer from the app | – | Coming |
| « Caisse »: bills to collect by table; « Encaisser »: cash with change, Orange Money / Moov with reference, card; split in equal parts or by dish; « sur demande » price; discounts with a reason (above 20 % only managers/owner); the table frees itself when paid | P B | Live |
| Receipts (print / PDF, WhatsApp) and « Clôture de caisse » (by method, person, category, discounts, cancellations; CSV and PDF) | P B | Live |
| Online payment plumbing (provider interface, « manual » provider, CinetPay / PayDunya / Ligdicash / Orange Money / Moov adapters waiting to be connected, webhooks, reconciliation, encrypted credentials) | – | Live (no provider connected yet) |
| Each business connects its **own** Orange Money / Moov merchant account or an aggregator (Paramètres → « Paiements »: test/live, write-only credentials, its own webhook address, « Tester la connexion »); customers then get « 💳 Payer maintenant » on their order and a payment status page; money goes straight to the business | P B | Ready, waiting for the first provider adapter ([guide](08-connecting-mobile-money.md)) |

### Reservations

| Feature | Plans | Status |
|---|---|---|
| Turn reservations on/off; slot interval, max guests, max covers per slot, notice, days ahead, form note | P B (all plans during the launch offer) | Live |
| Requests list with 📞 call, 💬 WhatsApp, ✉️ email; « J'ai appelé », Confirmer, Refuser (reason emailed), Arrivés, Terminée, Absent | P B | Live |
| Emails to the customer from RestoCool at each step | P B | Live |
| Arrival QR scanned by any staff who serve; works once; expires after the time (default 1 h, adjustable); no-shows marked automatically | P B | Live |
| « Temps d'attente » for busy days | P B | Live |
| Figures: today (expected, arrived, absent), 30 days (show-up rate, no-shows) | P B | Live |
| Seating preference, occasion, deposit, `.ics` calendar file, calendar week view, room conflict warning | – | Coming |

### Team

| Feature | Plans | Status |
|---|---|---|
| Personnel with matricule, phone, PIN; job roles with chosen access; custom roles | P B (Pro: up to 10) | Live |
| « Inviter mon équipe »: team QR → the person fills in their details → owner/manager approves | P B | Live |
| Pointage (check-in/out) by QR at the staff entrance or numéro RC + matricule + PIN | P B | Live |
| Authorised devices + « mode poste » (shared tablet with PIN login, auto-lock) | P B | Live |
| Former employees: archive, reinstate, erase personal data | P B | Live |
| Shifts and table/area assignments | – | Coming |

### Management

| Feature | Plans | Status |
|---|---|---|
| Dashboard: « En direct », « À surveiller » alerts, shortcuts, today's reservations, floor plan | P B | Live |
| Order analytics (by day, hour, dish), personnel ranking | P B (ranking: owners/managers) | Live |
| Customer reviews: read, hide, delete, turn off | P B | Live |
| Business offers and dish promotions | B | Live |
| RestoCool badge can be hidden | B | Live |
| « Aide et signalement » to the RestoCool team; 🔔 messages from RestoCool | G P B | Live |
| Animated guide by profile (owner sees all) | G P B | Live |
| Delete the business (72 h delay, 10 days to restore) | G P B | Live |
| Several businesses under one account (switcher) | G P B | Live |
| Combined reports across branches | B | Coming |

### Bus companies (transport)

| Feature | Status |
|---|---|
| Buses with generated seat maps (Elitis 50 seats…), seat-back QR cards, bus QR | Live |
| Itineraries, hostess assignments, trips; ordering only during an open trip | Live |
| Hostess rounds: scan several orders, confirm or serve in one tap | Live |

## For the RestoCool team (console `/admin_pro`)

| Feature | Status |
|---|---|
| Overview: businesses, orders, revenue, MRR, funnel, charts, feature usage | Live |
| Live: who is online now, orders waiting, traffic | Live |
| Businesses: search (name, town, owner email, numéro RC), filters, CSV, business page | Live |
| Record a plan payment, change plan/status, suspend/reactivate, publish, « À la une » | Live |
| Support inbox with urgency; account recovery with caller verification | Live |
| Messages and pop-ups to businesses (in-app + email) | Live |
| Marketing campaigns on the home page and free menus | Live |
| Reviews moderation view (everything kept), deletion requests, activity and errors | Live |
| Collaborators with roles and permissions, invitation emails, activity log | Live |
| « Feature usage »: cash register (collected, by method, bills, average ticket, discounts) | Live |
| Read-only impersonation of a business | Coming |
| Automatic plan payment | Coming |
