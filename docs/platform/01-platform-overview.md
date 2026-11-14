# 1. Platform overview

## What RestoCool is

RestoCool lets any business that serves food or drinks put its menu online, receive orders from customers' phones, take reservations and run its service from a phone or tablet. Customers never need an account or an app: they scan a QR code (or type a short code) and order.

- **Brand:** RestoCool, a product of TIBLOGICS. Founded by a Burkinabè. Prices in FCFA.
- **Main site:** restocool.com
- **Who it is for:** restaurants, maquis, bars and lounges, fast food, cafés and bakeries, hotels, caterers, shops, and VIP bus companies that serve food on board.

## The five places of the platform

| Place | Address | Who uses it |
|---|---|---|
| Home page | `restocool.com` | Visitors, future customers |
| Directory « Les Bons Coins sur RestoCool » | `restocool.com/restaurants` | Customers looking for a place |
| A business's public page (menu, ordering, reservations) | `restocool.com/r/<name>` | Customers |
| The business app | `restocool.com/app` | Owners, managers, staff |
| The platform console | `restocool.com/admin_pro` | TIBLOGICS team only |

Other useful public pages:

- `restocool.com/c`: type a numéro RC to open a menu.
- `restocool.com/tarifs`: plans and prices.
- `restocool.com/guide`: animated tutorials.
- `restocool.com/pointage`: staff check-in.
- `restocool.com/aide`: help for people locked out of their account.

## Key ideas to understand

**Numéro RC.** Every business has a 5-character code shown as « RC-K7M3P », printed under its main QR code. It is the business identifier: customers type it to open the menu, and the RestoCool team uses it to find a business. Every table and room QR also has its own code.

**QR codes.** Each business gets a main QR code at creation. Tables and private rooms get their own QR codes, and the owner prints them from the app (A4 sheets or stickers « Scannez-moi · Scan me »). Scanning a table QR places the customer at that table automatically.

**Places (seating).** A business can have numbered tables, private rooms (« salons »), areas (terrasse, bar…), a counter, takeaway (« À emporter ») and delivery, in any combination. Bus companies have buses with numbered seats instead.

**Live service.** An order goes from the customer's phone to the business screens instantly, and every status change goes back to the customer's phone. The statuses, in the customer's words, are:

1. « En attente de l'établissement »
2. Confirmée
3. En préparation
4. Prête
5. Servie

An order can be cancelled at any step, with a reason.

**Team without email.** Staff do not need an email address. Each person gets a matricule (001, 002…) and a 4–6 digit PIN. With these they can:

- check in and out (pointage);
- use the shared tablet (« mode poste »).

The owner and managers usually sign in with an account (email or Google).

**Three languages.** Every customer page works in French (default), English and Chinese. The business app also works in all three.

**Works on weak networks.** Pages are light. The menu keeps working offline after the first visit. Orders and staff actions made without network wait on the phone and are sent automatically when the network returns.

## Roles

| Role | How they sign in | What they can do |
|---|---|---|
| Customer | No account | Read the menu, order, follow the order, share the selection with the table, reserve, leave a review |
| Server, host, cashier, kitchen… (job roles) | PIN on the business tablet, or an account | What their job role allows: confirm and serve orders, prepare in the kitchen, check reservations in, free tables… |
| Manager (« gérant ») | Account | Everything in the business except what only the owner can do |
| Owner (« propriétaire ») | Account | Everything: settings, plan, roles, team leads, deleting the business |
| RestoCool team | Account on the console | Platform-wide administration (by permission) |

Owners can create custom job roles and choose what each role can access (`/app/staff/roles`).

## Plans

| | Gratuit | Pro | Business |
|---|---|---|---|
| Price | 0 F | 10 000 F / month | 25 000 F / month |

- Every new business starts with **Pro**.
- During the **launch offer**, Pro is free and never expires. The RestoCool team turns the offer off from the console the day paid plans start.
- Plans are paid by Orange Money, Moov Money or cash, and activated by the RestoCool team. Online payment is not available yet.
- No data is ever deleted when a plan ends.

See the [features list](02-features-list.md) for exactly what each plan includes.

## Where the data lives and how it is protected

- One database with every business. Each business only ever sees its own data; this is tested automatically.
- Photos are stored in Replit Object Storage.
- A backup runs on every publish (last 14 kept). See [`docs/BACKUP.md`](../BACKUP.md).
- Hosting is on Replit, outside Burkina Faso. Never claim local hosting.
- Personal data handling is described in the privacy policy (`/privacy`) and terms (`/terms`).
