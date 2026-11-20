# 3. SOP: onboarding a business

**Goal:** a business goes from « interested » to « customers can scan and order » in one visit (about 45 minutes), with the owner holding their own account.

**Who:** a RestoCool agent with the owner, or the owner alone with this document.

**Golden rule:** the business is always created **with the owner's own account** (their email or Google). The agent never creates a business under their own account for someone else.

---

## A. Before the visit

1. Collect the business name, town, WhatsApp number, and whether they have tables, private rooms, takeaway or delivery.
2. Ask for the paper menu (photos of it are fine) and 5–10 dish photos if they have them.
3. Check the name is free. Search it on `restocool.com/restaurants`. If it is taken, the app will suggest close names at creation.
4. Bring:
   - a phone with data;
   - the demo on screen (`restocool.com/r/restaurant-demo`);
   - a printed demo sticker if possible.

## B. Create the account and the business (owner's phone)

1. On the owner's phone, open `restocool.com` and tap **« Essayer gratuitement »** / **« Créer mon établissement »**.
2. Sign up with the owner's email (they receive a code), or with Google. **The email must be one the owner reads**: RestoCool sends the welcome email and reservation notices there.
3. Type the business name. Wait for « ✓ Nom disponible ». If the name is taken, tap one of the suggestions.
4. Choose the town (« Autre ville… » if it is not listed) and the kind:
   - restaurant/maquis/bar/etc.;
   - or « Transport : bus VIP avec repas à bord ».
5. The welcome email arrives in the background, with the numéro RC (RC-XXXXX).

## C. The setup wizard (6 steps, all on the phone)

| Step | What to fill in | Tip |
|---|---|---|
| 1. « Votre établissement » | Name, town | Done at creation |
| 2. « Profil » | « Slogan ou présentation courte », location (« Je suis à mon établissement » with GPS, or a Google Maps link) | Do the GPS step **inside** the business |
| 3. « Contacts » | Phone(s), WhatsApp, Orange Money and Moov numbers | Confirm whether takeaway orders go to the same WhatsApp |
| 4. « Horaires » | Opening hours per day | Hours drive « Ouvert / Fermé » and the reservation times |
| 5. « Service et tables » | **« Comment servez-vous vos clients ? »**: Sur place, À emporter, Livraison (tick all that apply). With « Sur place »: how customers sit (tables, areas, private rooms, counter) and how many tables (1..N are created with their QR); QR strategy | A takeaway/delivery-only business unticks « Sur place »: no tables, and the app hides table screens. Changeable any time in Paramètres → Service |
| 6. « Image de marque » | Logo, cover photo of the business, theme and colours | A real photo of the front or the room makes a big difference |

At the end, the app unlocks and shows « Prochaines étapes » and the main QR card.

## D. Build the menu

1. Open **« Menu »** (📖).
2. Create the categories (Entrées, Plats, Boissons…). Add a time window if a category is only served at lunch, for example.
3. Add the dishes:
   - name in French; « Suggérer » fills English and Chinese;
   - price, or « Sur demande »;
   - variants (half/full portion, bottle sizes) and options with a price (extras);
   - spice level, « Nouveau », kitchen station;
   - a photo: take it with the phone, and it is compressed automatically.
4. Use « Dupliquer » for similar dishes.
5. Gratuit plan: up to 40 dishes. Pro and Business: unlimited.

## E. QR codes and going live

1. **« Tables et salles »** (🪑): check the tables and rooms, then print the QR kit:
   - « Imprimer les cartes QR » gives A4 table tents or 6 cards per page;
   - print from the phone or save as PDF and print at a shop.
2. Download the **main QR sticker** (« Scannez-moi · Scan me » with the numéro RC) from the dashboard card. Place it at the entrance and on the counter.
3. **Publish:** Paramètres → « Publier ». Until then, only the team sees the page (preview).
4. Test it as a customer:
   - scan a table QR with another phone;
   - add a dish and tap « Confirmer la commande »;
   - check the order appears on « Service » (🛎️).
5. Show the owner the « Personnalisez votre page » checklist on the dashboard until all 5 items are done.

## F. The team

1. **Personnel → « Inviter mon équipe »** shows the team QR.
2. Each person scans it and fills in their name, phone and a PIN chosen twice.
3. The owner (or a manager) accepts each request with a job role:
   - serveur·se, hôte·sse, caissier·ère, cuisinier·ère…;
   - only the owner gives lead roles (gérant·e).
4. People without a smartphone: **« Ajouter à la main »**.
5. Print the **pointage QR** for the staff entrance: Personnel → « Pointage » section → « 🖨️ Imprimer ».
6. Shared tablet: on the tablet, the owner signs in, then:
   - Personnel → Appareils → « Autoriser cet appareil »;
   - then « Passer en mode poste »;
   - staff then tap their name and type their PIN.

## G. Optional features to switch on

| Feature | Where | When |
|---|---|---|
| Reservations | 📅 Réservations → Réglages → « Ouvrir les réservations sur ma page » | Businesses that take bookings |
| Reviews | On by default (Paramètres → Fonctions, or ⭐ Avis clients) | Usually leave on |
| Validation mode | Paramètres → Service: « Direct » or the server confirms first | « Direct » for small teams |
| Business offers | 🔥 Promotions (Business plan) | Happy hours, dish of the week |

## H. Prepared businesses (created by RestoCool, claimed by the owner)

Some businesses were created by RestoCool before the owner signed up. Today this is the case for **Shangri-La** and **La Terrace**.

Such a business carries an **owner email**. The first person who signs in with that exact email, **verified**, becomes the owner (matricule 001). The email is then removed from the business.

### Shangri-La: steps

1. **RestoCool team:** in Replit → Secrets, add `SHANGRILA_OWNER_EMAIL` with the owner's email (lower case, exactly as they gave it).
2. **RestoCool team:** republish. On start, the import sees Shangri-La already exists and only records the owner email. The publish logs show « ✓ Shangri-La: owner email recorded (…) ».
3. **The owner:**
   - opens `restocool.com/sign-up` and creates an account with **that same email**;
   - or signs in with Google if it is a Gmail address;
   - enters the code received by email (this verifies the address).
4. They land on `restocool.com/app`. The app recognises the email and gives them Shangri-La with full owner rights. There is no setup wizard: setup is already marked done.
5. With the owner, check and complete:
   - Paramètres: contacts, Orange Money / Moov numbers, location;
   - **opening hours** (none are set: the page hides « Ouvert / Fermé » until they are);
   - cover photo.
6. Then the team (section F), reservations if wanted (section G), and a test order (section E, step 4).

If the owner signs up with a **different** email, nothing happens: they see « create your business ». Do not let them create a second Shangri-La. Fix the secret (or have them use the right email), republish, then they sign in again.

### La Terrace: steps

Same as Shangri-La, with the secret `LATERRACE_OWNER_EMAIL` (logs: « ✓ La Terrace: owner email recorded (…) »). The difference: La Terrace's setup is **not** marked done, so after signing in the owner goes through the setup wizard (prefilled: name, slogan, phone, address, location, colours, logo, front photo, menu). With them:

- check the phone and add their **WhatsApp** (it receives takeaway orders) and Orange Money / Moov numbers;
- set the **opening hours** (Google only says « closes at 3 AM »);
- choose the **number of tables** (none were created; takeaway and delivery already exist);
- add the photos of their dishes (the menu was imported without dish photos; the front photo is already there).

## I. Go-live checklist (tick with the owner)

- [ ] Owner's account works on their phone; they know their email and password (or Google).
- [ ] Welcome email received; numéro RC noted.
- [ ] Profile, contacts, opening hours, location, logo and cover photo done.
- [ ] Menu complete with prices; at least the best dishes have photos.
- [ ] Table and room QRs printed and placed; main sticker at the entrance.
- [ ] Page published; test order received on « Service ».
- [ ] Team invited and accepted; pointage QR placed; shared tablet in « mode poste » if used.
- [ ] Reservations on or off as decided; wait time explained.
- [ ] Owner has watched « Propriétaire » in the guide (`/app/guide`) and knows « Aide et signalement » (🛟).
- [ ] Follow-up date set (see the [playbook](06-sales-and-onboarding-playbook.md), section 7).
