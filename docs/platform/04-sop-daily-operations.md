# 4. SOP: daily operations in a business

How a business runs a service day with RestoCool. Owners use it to train their team; the in-app guide (`/app/guide`, one tab per profile) shows each step animated.

---

## 1. Opening

1. **Staff check in (pointage):**
   - scan the pointage QR at the staff entrance, or open `restocool.com/pointage` and type the numéro RC;
   - type the matricule (for example 004) and PIN;
   - the same code checks out at the end;
   - 5 wrong PINs lock that person for 10 minutes.
2. **Shared tablet (« mode poste »):** each person taps their name and types their PIN.
   - The tablet locks itself after 15 minutes without use, and the session ends after 12 hours (both can be changed in Paramètres).
   - Tap **« Verrouiller »** when leaving the tablet.
3. **Kitchen:** open « Cuisine » (👩‍🍳) on the kitchen tablet and keep it on.
4. **Sold out:** mark dishes not available today with « Épuisé ». Customers see it at once, and it resets the next day.
5. **Busy day expected?** Set the wait time: 📅 Réservations → « Temps d'attente » → choose minutes → « Afficher l'attente ».

## 2. Taking and serving orders

| Step | Who | What they do |
|---|---|---|
| Customer orders | Customer | Scans the table QR, chooses dishes, « Confirmer la commande ». Status: « En attente de l'établissement » |
| New order arrives | Front desk, servers | « Service » (🛎️) rings and shows the card with the seat badge, oldest first (« 1er, 2e… ») |
| Confirm | Server / front desk | « Confirmer ». In « Direct » mode, orders arrive already confirmed |
| Prepare | Kitchen | Tap each dish when starting (« En cours »), then « Tout est prêt » |
| Serve | Server | « Servi » when the dishes are on the table. The customer's phone shows « Vous avez été servi ! » |
| Free the table | Server | « Table libérée » → « Oui, la table 4 est libre » once the customers have left |

Good to know:

- **Customer shows their phone** (« Montrer au serveur »): scan the QR on their screen with the phone camera or « Scanner » (📷) in the app. The order opens directly.
- **Shared order:** each dish carries the person's name (« Moussa · sans piment »). Serve each dish to the right person.
- **Takeaway:** the card shows the name, a tap-to-call phone and « Retrait à 12:30 ».
- **Cancel:** only roles allowed to cancel; a reason is required and the customer sees it.
- **Orders nobody picked up:** an order left « En attente de l'établissement » for 2 hours closes itself as « Non prise en charge ». Avoid this: someone must always watch « Service » during opening hours.
- **Tables free themselves when abandoned:**
  - 20 minutes after a scan with no order;
  - 1 hour after everything is served;
  - 6 hours if orders were forgotten in progress.
  « Table libérée » is still the right way to do it.
- **« Salle en direct »** on the dashboard shows each table:
  - libre;
  - commande en attente;
  - en cuisine;
  - prête à servir;
  - servie – en train de manger.

## 3. Reservations

1. **New request:**
   - 📅 Réservations shows a badge, and « À surveiller » on the dashboard shows an alert;
   - open it, tap 📞 to call the customer, then tap « J'ai appelé »;
   - tap **« Confirmer »**: the customer receives an email with their arrival QR;
   - or tap « Refuser » with a reason, which is emailed to the customer.
2. **Arrival:** the guest shows the QR from their email. Any staff who serve scan it (phone camera or « Scanner »), check the name and number of guests, and tap **« Confirmer l'arrivée »**.
   - The QR works once.
   - Without the QR, find the reservation by name and tap « Arrivés ».
3. **End:** tap « Terminée » when they leave.
4. **No-show:** after the reservation time plus the expiry (default 1 hour), the guest is marked « Absent » automatically and the QR stops working.
5. **Change the rules:** Réservations → Réglages (owner, managers):
   - slot interval, max guests, covers per slot;
   - notice, days ahead, QR expiry.

## 4. During the day

- **« À surveiller »** (dashboard) lists what needs attention:
  - orders waiting more than 5 minutes;
  - ready orders not served;
  - locked PINs;
  - reservation requests;
  - join requests.
- **Join requests** pop up live for owners and managers: accept with a job role, or decline.
- **Reviews:** ⭐ Avis clients. Answer issues in person; hide or delete only abusive reviews (the RestoCool team keeps a record of everything).
- **Problem with the app:** 🛟 « Aide et signalement », choose the urgency (« Bloquant » for anything stopping service). The answer arrives in the 🔔 bell.

## 5. Network problems

- The red banner « Hors ligne » appears by itself. **Keep working:** confirm, prepare, serve and free tables as usual.
  - Actions show « ⏳ en attente » and are sent in order when the network returns.
  - Customers' orders also wait on their phones and arrive automatically.
- Payments, settings and personnel changes need the network.
- If an action was already done by someone else meanwhile, the app says so: check the card.

## 6. Closing

1. Make sure no order is left in progress on « Service » and « Cuisine ».
2. Free the tables still marked as occupied.
3. Remove the wait time if it is still shown (« Retirer l'attente »).
4. Staff check out (pointage). Lock the shared tablet (« Verrouiller »).
5. Owner/manager: check the dashboard figures and the order history (🧾), export a CSV if needed.

## 7. Weekly (owner / manager)

- Review the analytics and the personnel ranking on the dashboard.
- Reservations figures:
  - show-up rate and no-shows over 30 days;
  - adjust the QR expiry or deposits policy if no-shows are high.
- Update the menu: prices, new dishes, photos.
- Former employees: Personnel → « A quitté l'établissement… » the same day they leave (access closes at once).
