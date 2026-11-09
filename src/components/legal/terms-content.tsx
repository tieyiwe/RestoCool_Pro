import Link from "next/link";
import { fillOr, LEGAL } from "@/config/legal";
import { PLANS } from "@/config/plans";
import { formatFCFA } from "@/lib/format";

function Publisher({ lang }: { lang: "fr" | "en" }) {
  const tbc = lang === "fr" ? "[à compléter]" : "[to be completed]";
  const fr = lang === "fr";
  return (
    <ul>
      <li>
        {fr ? "Éditeur" : "Publisher"} : {LEGAL.publisher}
        {LEGAL.legalForm ? `, ${LEGAL.legalForm}` : ""}
      </li>
      <li>RCCM : {fillOr(LEGAL.rccm, tbc)}</li>
      <li>IFU : {fillOr(LEGAL.ifu, tbc)}</li>
      <li>
        {fr ? "Adresse" : "Address"} : {fillOr(LEGAL.address, tbc)}
      </li>
      <li>
        {fr ? "Contact" : "Contact"} : {fillOr(LEGAL.email, tbc)} · WhatsApp {fillOr(LEGAL.whatsapp, tbc)}
      </li>
      <li>
        {fr ? "Site" : "Website"} : {LEGAL.website}
      </li>
    </ul>
  );
}

const price = (n: number) => formatFCFA(n)!;

export function TermsFr() {
  return (
    <>
      <p>
        Les présentes conditions encadrent l’utilisation de {LEGAL.product} ({LEGAL.website}) par les restaurants et par les personnes qui consultent leurs
        menus. En créant un compte ou en utilisant le service, vous les acceptez.
      </p>

      <h2>1. Éditeur</h2>
      <Publisher lang="fr" />

      <h2>2. Le service</h2>
      <p>
        {LEGAL.product} permet à un restaurant de publier un menu numérique (photos, prix en F CFA, trois langues), de générer des QR codes pour ses tables, de
        recevoir des commandes et des réservations, et de gérer sa salle, son personnel et ses paiements. Certaines fonctions dépendent de la formule choisie.
      </p>

      <h2>3. Compte restaurant</h2>
      <ul>
        <li>Vous devez être majeur et autorisé à représenter le restaurant.</li>
        <li>Les informations fournies doivent être exactes. Vous êtes responsable des accès que vous donnez (gérants, personnel, appareils autorisés).</li>
        <li>Gardez vos identifiants et codes PIN confidentiels et prévenez-nous de toute utilisation non autorisée.</li>
      </ul>

      <h2>4. Formules, essai et paiement</h2>
      <ul>
        <li>
          Formules : Gratuit ({price(PLANS.gratuit.priceMonthly)}), Pro (à partir de {price(PLANS.pro.priceMonthly)} par mois) et Business (à partir de{" "}
          {price(PLANS.business.priceMonthly)} par mois). Les prix et le contenu de chaque formule sont indiqués sur le site et peuvent évoluer ; tout changement
          de prix est annoncé au moins 30 jours à l’avance.
        </li>
        <li>Chaque nouveau restaurant bénéficie de 30 jours d’essai de la formule Pro, sans engagement.</li>
        <li>Le paiement se fait en F CFA, par Orange Money, Moov Money ou en espèces. L’activation est confirmée par {LEGAL.publisher}.</li>
        <li>
          En cas de retard de paiement, le service continue pendant 7 jours. Ensuite, le compte est suspendu : le menu reste visible, mais la commande en ligne est
          désactivée. Aucune donnée n’est supprimée du fait d’un retard de paiement.
        </li>
        <li>Les sommes payées pour une période commencée ne sont pas remboursées, sauf erreur de notre part.</li>
      </ul>

      <h2>5. Responsabilités du restaurant</h2>
      <ul>
        <li>Le contenu du menu (noms, descriptions, prix, photos, allergènes, disponibilité) est sous la seule responsabilité du restaurant et doit être exact.</li>
        <li>Le restaurant doit détenir les droits sur les photos, logos et textes qu’il publie.</li>
        <li>
          Le restaurant est le seul vendeur des plats et boissons. Les commandes, la préparation, l’hygiène, la livraison, l’encaissement et le service client
          relèvent de sa responsabilité, ainsi que le respect des lois qui s’appliquent à son activité (licences, prix, vente d’alcool, etc.).
        </li>
        <li>Pour les données de ses clients traitées dans {LEGAL.product}, le restaurant est responsable du traitement (voir la politique de confidentialité).</li>
      </ul>

      <h2>6. Clients des restaurants</h2>
      <p>
        Consulter un menu ne demande pas de compte. Une commande ou une réservation passée via {LEGAL.product} est un engagement envers le restaurant, pas envers{" "}
        {LEGAL.publisher}. Pour toute question sur une commande, un prix ou un paiement, adressez-vous au restaurant.
      </p>

      <h2>7. Utilisation interdite</h2>
      <ul>
        <li>Publier un contenu illégal, trompeur, haineux ou qui porte atteinte aux droits d’autrui.</li>
        <li>Tenter d’accéder aux données d’un autre restaurant, de contourner les limites techniques ou de perturber le service (envoi massif de requêtes, robots).</li>
        <li>Utiliser un QR code ou un lien de table pour passer de fausses commandes.</li>
      </ul>
      <p>Nous pouvons suspendre un compte ou retirer un contenu qui ne respecte pas ces règles, après avoir prévenu le restaurant sauf urgence.</p>

      <h2>8. Propriété intellectuelle</h2>
      <p>
        La marque {LEGAL.product}, le logo et le logiciel appartiennent à {LEGAL.publisher}. Le restaurant reste propriétaire de son contenu et nous autorise à
        l’héberger et à l’afficher pour fournir le service. Le badge « Menu par {LEGAL.product} » figure sur les menus publics, sauf option disponible avec la
        formule Business.
      </p>

      <h2>9. Disponibilité et responsabilité</h2>
      <p>
        Nous faisons de notre mieux pour que le service soit disponible et fiable, mais il peut être interrompu pour maintenance ou en cas de panne d’un
        prestataire ou du réseau. Dans les limites permises par la loi, notre responsabilité est limitée aux dommages directs et au montant payé par le restaurant
        au cours des 3 derniers mois. Nous ne sommes pas responsables des relations entre un restaurant et ses clients.
      </p>

      <h2>10. Données personnelles</h2>
      <p>
        Le traitement des données est décrit dans notre{" "}
        <Link href="/privacy?lang=fr" className="underline">
          politique de confidentialité
        </Link>
        .
      </p>

      <h2>11. Résiliation</h2>
      <p>
        Le restaurant peut fermer son compte à tout moment en nous contactant. Ses données sont alors supprimées dans les conditions prévues par la politique de
        confidentialité ; il peut demander une copie de son menu avant la fermeture.
      </p>

      <h2>12. Modifications</h2>
      <p>Nous pouvons modifier ces conditions. Les restaurants sont prévenus au moins 30 jours avant l’entrée en vigueur d’un changement important.</p>

      <h2>13. Droit applicable</h2>
      <p>
        Ces conditions sont régies par le droit du Burkina Faso. En cas de litige, nous chercherons d’abord une solution amiable ; à défaut, les juridictions de
        Ouagadougou seront compétentes.
      </p>
    </>
  );
}

export function TermsEn() {
  return (
    <>
      <p>
        These terms govern the use of {LEGAL.product} ({LEGAL.website}) by restaurants and by people who view their menus. By creating an account or using the
        service, you accept them.
      </p>

      <h2>1. Publisher</h2>
      <Publisher lang="en" />

      <h2>2. The service</h2>
      <p>
        {LEGAL.product} lets a restaurant publish a digital menu (photos, prices in CFA francs, three languages), generate QR codes for its tables, receive orders
        and reservations, and manage its dining room, staff and payments. Some features depend on the chosen plan.
      </p>

      <h2>3. Restaurant account</h2>
      <ul>
        <li>You must be an adult and authorised to represent the restaurant.</li>
        <li>Information you provide must be accurate. You are responsible for the access you grant (managers, staff, authorised devices).</li>
        <li>Keep your credentials and PIN codes confidential and tell us about any unauthorised use.</li>
      </ul>

      <h2>4. Plans, trial and payment</h2>
      <ul>
        <li>
          Plans: Free ({price(PLANS.gratuit.priceMonthly)}), Pro (from {price(PLANS.pro.priceMonthly)} per month) and Business (from{" "}
          {price(PLANS.business.priceMonthly)} per month). Prices and plan contents are shown on the website and may change; any price change is announced at
          least 30 days in advance.
        </li>
        <li>Every new restaurant gets a 30-day trial of the Pro plan, with no commitment.</li>
        <li>Payment is in CFA francs, by Orange Money, Moov Money or cash. Activation is confirmed by {LEGAL.publisher}.</li>
        <li>
          If a payment is late, the service continues for 7 days. After that the account is suspended: the menu stays visible but online ordering is turned off.
          No data is deleted because of a late payment.
        </li>
        <li>Amounts paid for a period that has started are not refunded, unless we made an error.</li>
      </ul>

      <h2>5. Restaurant responsibilities</h2>
      <ul>
        <li>Menu content (names, descriptions, prices, photos, allergens, availability) is solely the restaurant’s responsibility and must be accurate.</li>
        <li>The restaurant must hold the rights to the photos, logos and texts it publishes.</li>
        <li>
          The restaurant is the only seller of its food and drinks. Orders, preparation, hygiene, delivery, payment collection and customer service are its
          responsibility, as is compliance with the laws that apply to its business (licences, prices, sale of alcohol, etc.).
        </li>
        <li>For its customers’ data processed in {LEGAL.product}, the restaurant is the controller (see the privacy policy).</li>
      </ul>

      <h2>6. Restaurant customers</h2>
      <p>
        Viewing a menu needs no account. An order or reservation placed through {LEGAL.product} is a commitment to the restaurant, not to {LEGAL.publisher}. For
        any question about an order, a price or a payment, contact the restaurant.
      </p>

      <h2>7. Prohibited use</h2>
      <ul>
        <li>Publishing illegal, misleading or hateful content, or content that infringes others’ rights.</li>
        <li>Trying to access another restaurant’s data, bypass technical limits or disrupt the service (mass requests, bots).</li>
        <li>Using a table QR code or link to place fake orders.</li>
      </ul>
      <p>We may suspend an account or remove content that breaks these rules, after warning the restaurant except in an emergency.</p>

      <h2>8. Intellectual property</h2>
      <p>
        The {LEGAL.product} brand, logo and software belong to {LEGAL.publisher}. The restaurant keeps ownership of its content and allows us to host and display
        it to provide the service. The “Menu by {LEGAL.product}” badge appears on public menus, unless removed with the Business plan option.
      </p>

      <h2>9. Availability and liability</h2>
      <p>
        We do our best to keep the service available and reliable, but it may be interrupted for maintenance or by a provider or network outage. To the extent
        permitted by law, our liability is limited to direct damage and to the amount paid by the restaurant over the last 3 months. We are not responsible for
        the relationship between a restaurant and its customers.
      </p>

      <h2>10. Personal data</h2>
      <p>
        Data processing is described in our{" "}
        <Link href="/privacy?lang=en" className="underline">
          privacy policy
        </Link>
        .
      </p>

      <h2>11. Termination</h2>
      <p>
        A restaurant can close its account at any time by contacting us. Its data is then deleted as described in the privacy policy; it can ask for a copy of its
        menu before closing.
      </p>

      <h2>12. Changes</h2>
      <p>We may change these terms. Restaurants are notified at least 30 days before a significant change takes effect.</p>

      <h2>13. Governing law</h2>
      <p>
        These terms are governed by the law of Burkina Faso. In case of dispute we will first seek an amicable solution; failing that, the courts of Ouagadougou
        will have jurisdiction.
      </p>
    </>
  );
}
