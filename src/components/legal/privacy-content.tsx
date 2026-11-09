import { fillOr, GOOGLE_PERMISSIONS_URL, GOOGLE_USER_DATA_POLICY_URL, LEGAL } from "@/config/legal";

const TBC_FR = "[à compléter]";
const TBC_EN = "[to be completed]";

function Contact({ lang }: { lang: "fr" | "en" }) {
  const tbc = lang === "fr" ? TBC_FR : TBC_EN;
  return (
    <ul>
      <li>
        {lang === "fr" ? "E-mail" : "Email"} : {fillOr(LEGAL.email, tbc)}
      </li>
      <li>WhatsApp : {fillOr(LEGAL.whatsapp, tbc)}</li>
      <li>
        {lang === "fr" ? "Adresse" : "Address"} : {fillOr(LEGAL.address, tbc)}
      </li>
    </ul>
  );
}

export function PrivacyFr() {
  return (
    <>
      <p>
        {LEGAL.product} est une plateforme de menus numériques, de commande et de gestion de salle pour les restaurants. C’est un produit de {LEGAL.publisher}
        {LEGAL.legalForm ? ` (${LEGAL.legalForm})` : ""}, société établie aux {LEGAL.country.fr} et membre du groupe {LEGAL.parentGroup} (« nous »). Cette
        politique explique quelles données nous traitons, pourquoi, avec qui, combien de temps, et quels sont vos droits.
      </p>

      <h2>1. Qui est concerné ?</h2>
      <ul>
        <li>
          <strong>Les restaurateurs</strong> (propriétaires et gérants) qui créent un compte {LEGAL.product}.
        </li>
        <li>
          <strong>Le personnel</strong> des restaurants (serveurs, cuisine, caisse) quand le restaurant leur crée un profil.
        </li>
        <li>
          <strong>Les clients des restaurants</strong> qui consultent un menu, choisissent une place ou passent commande. Ils n’ont pas besoin de compte.
        </li>
      </ul>

      <h2>2. Qui est responsable ?</h2>
      <p>
        {LEGAL.publisher} est responsable du traitement pour les comptes des restaurateurs et le fonctionnement de la plateforme. Pour les données des clients
        d’un restaurant (commandes, réservations, prénom donné au comptoir, numéro de téléphone pour une livraison), <strong>le restaurant</strong> est
        responsable du traitement et {LEGAL.publisher} agit pour son compte, comme sous-traitant.
      </p>

      <h2>3. Données que nous traitons</h2>
      <table>
        <thead>
          <tr>
            <th>Personnes</th>
            <th>Données</th>
            <th>Pourquoi</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Restaurateurs</td>
            <td>Nom, adresse e-mail, photo de profil, identifiant de connexion (fourni par notre service d’authentification, ou par Google si vous choisissez « Continuer avec Google », voir la section 5), rôle dans le restaurant.</td>
            <td>Créer et sécuriser votre compte, vous donner accès à votre restaurant.</td>
          </tr>
          <tr>
            <td>Restaurants</td>
            <td>Nom, adresse, ville, téléphones, numéros WhatsApp, Orange Money et Moov Money, horaires, menu, photos, logo, tables et salles.</td>
            <td>Afficher le menu public et faire fonctionner le service. Ces informations sont publiques une fois le menu publié.</td>
          </tr>
          <tr>
            <td>Personnel</td>
            <td>Nom, photo (facultative), rôle, téléphone, code PIN (enregistré uniquement sous forme chiffrée), heures de connexion et actions effectuées.</td>
            <td>Connexion sans e-mail sur les appareils du restaurant, savoir qui a fait quoi.</td>
          </tr>
          <tr>
            <td>Clients des restaurants</td>
            <td>
              Un identifiant aléatoire de l’appareil (sans nom), la place choisie, le contenu de la sélection et des commandes, et si nécessaire un prénom (comptoir),
              une adresse et un numéro de téléphone (livraison), un nom et un numéro (réservation).
            </td>
            <td>Associer un téléphone à une table, partager une addition, suivre une commande, contacter le client pour sa commande ou sa réservation.</td>
          </tr>
          <tr>
            <td>Tous</td>
            <td>Journaux techniques (date, adresse IP, page demandée, erreurs).</td>
            <td>Sécurité, prévention des abus (limitation du nombre de requêtes) et correction des problèmes.</td>
          </tr>
        </tbody>
      </table>
      <p>
        Nous ne vendons pas vos données, nous ne faisons pas de publicité ciblée et nous n’utilisons aucun outil de mesure d’audience tiers.
      </p>

      <h2>4. Bases du traitement</h2>
      <ul>
        <li>L’exécution du contrat avec les restaurants (compte, menu, commandes, réservations).</li>
        <li>Notre intérêt légitime à sécuriser le service et à prévenir les abus.</li>
        <li>Nos obligations légales (par exemple comptables) lorsqu’elles s’appliquent.</li>
      </ul>

      <h2>5. Connexion avec Google</h2>
      <p>
        Les restaurateurs peuvent se connecter avec leur compte Google (« Continuer avec Google »). Dans ce cas :
      </p>
      <ul>
        <li>
          <strong>Données reçues de Google</strong> : uniquement votre nom, votre adresse e-mail, votre photo de profil et un identifiant Google (autorisations
          « openid », « email » et « profile »). Nous n’accédons ni à vos e-mails Gmail, ni à vos contacts, ni à vos fichiers Drive, ni à votre agenda, ni à
          aucune autre donnée de votre compte Google.
        </li>
        <li>
          <strong>Utilisation</strong> : uniquement pour créer votre compte {LEGAL.product}, vous reconnaître à chaque connexion, afficher votre nom dans votre
          espace et vous contacter au sujet de votre compte.
        </li>
        <li>
          <strong>Partage</strong> : ces données sont transmises à notre prestataire d’authentification (Clerk) et enregistrées dans notre base de données
          hébergée par Replit, uniquement pour fournir le service. Nous ne les vendons pas, ne les utilisons pas pour de la publicité, ne les transférons pas à des
          courtiers en données et ne les utilisons pas pour entraîner des modèles d’intelligence artificielle.
        </li>
        <li>
          <strong>Conservation et suppression</strong> : elles sont conservées tant que votre compte existe. Vous pouvez demander la suppression de votre compte
          (section 10) ; vos données Google sont alors supprimées de nos systèmes. Vous pouvez aussi retirer à tout moment l’accès de {LEGAL.product} à votre
          compte Google sur{" "}
          <a href={GOOGLE_PERMISSIONS_URL} className="underline" rel="noopener">
            myaccount.google.com/permissions
          </a>
          .
        </li>
        <li>
          L’utilisation et le transfert par {LEGAL.product} des informations reçues des API Google respectent les{" "}
          <a href={GOOGLE_USER_DATA_POLICY_URL} className="underline" rel="noopener">
            règles relatives aux données utilisateur des services d’API Google
          </a>
          , y compris les exigences d’utilisation limitée (« Limited Use »).
        </li>
      </ul>

      <h2>6. Prestataires et lieux d’hébergement</h2>
      <p>Nous faisons appel à des prestataires qui traitent des données pour notre compte :</p>
      <ul>
        <li>
          <strong>Replit</strong> : hébergement de l’application, base de données et stockage des photos (infrastructure située hors du Burkina Faso, notamment
          aux États-Unis).
        </li>
        <li>
          <strong>Clerk</strong> : authentification des restaurateurs (comptes et sessions de connexion), États-Unis.
        </li>
        <li>
          <strong>Google</strong> : uniquement si vous choisissez « Continuer avec Google » (voir la section 5).
        </li>
      </ul>
      <p>
        {LEGAL.publisher} étant établie aux {LEGAL.country.fr} et nos prestataires y hébergeant les données, vos données sont traitées et stockées aux{" "}
        {LEGAL.country.fr}, donc hors du Burkina Faso. Nous choisissons des prestataires qui appliquent des mesures de sécurité reconnues et nous limitons les
        données transmises au strict nécessaire.
      </p>
      <p>
        Les liens « WhatsApp » (contact, commande à emporter, partage) ouvrent l’application WhatsApp sur votre téléphone : le message n’est envoyé que si vous
        l’envoyez vous-même, et il est alors soumis aux règles de WhatsApp (Meta). Les paiements Orange Money et Moov Money sont aujourd’hui réalisés en dehors
        de {LEGAL.product} et confirmés à la main par le restaurant.
      </p>

      <h2>7. Cookies et stockage sur votre appareil</h2>
      <p>Nous n’utilisons que ce qui est nécessaire au fonctionnement du service, sans cookie publicitaire ni de mesure d’audience :</p>
      <ul>
        <li>Cookies de connexion de notre service d’authentification (restaurateurs uniquement).</li>
        <li>« NEXT_LOCALE » : la langue choisie dans l’espace restaurant.</li>
        <li>« rc_restaurant » : le restaurant actif quand vous en gérez plusieurs.</li>
        <li>
          Sur les menus publics, le stockage local du navigateur garde : l’identifiant aléatoire de l’appareil, la langue et la sélection de la visite en cours, la
          place choisie, le mode « économie de données ». Ces informations restent sur votre téléphone ; vous pouvez les effacer depuis les réglages du navigateur.
        </li>
        <li>Une copie du menu et des photos peut être gardée sur le téléphone pour fonctionner hors connexion.</li>
      </ul>

      <h2>8. Durées de conservation</h2>
      <ul>
        <li>Comptes et données des restaurants : pendant toute la durée du compte, puis supprimés dans un délai de 90 jours après la fermeture du compte, sauf obligation légale.</li>
        <li>Une formule non payée n’entraîne jamais la suppression des données : le menu reste visible et le compte peut être réactivé.</li>
        <li>Places et sessions de table : fermées automatiquement après quelques heures d’inactivité ; leurs traces sont conservées au plus 12 mois.</li>
        <li>Commandes, paiements et réservations : selon les obligations comptables applicables au restaurant, au plus 10 ans.</li>
        <li>Journaux techniques et d’audit : 12 mois.</li>
      </ul>

      <h2>9. Sécurité</h2>
      <p>
        Connexions chiffrées (HTTPS), séparation stricte des données de chaque restaurant, contrôle des droits sur chaque action, codes PIN et jetons
        enregistrés sous forme chiffrée, journal de qui a fait quoi, limitation des requêtes sur les pages publiques. Aucun système n’étant parfaitement sûr, nous
        vous informerons en cas d’incident vous concernant.
      </p>

      <h2>10. Vos droits</h2>
      <p>
        Vous pouvez demander l’accès à vos données, leur rectification, leur suppression, ou vous opposer à un traitement. Pour les données traitées pour un
        restaurant (par exemple une commande), adressez-vous d’abord au restaurant ; nous l’aiderons à répondre. Pour exercer vos droits, contactez-nous :
      </p>
      <Contact lang="fr" />
      <p>
        Nous répondons dans un délai de 30 jours. Si vous êtes au Burkina Faso, vous pouvez aussi saisir l’autorité de protection des données, la Commission de
        l’Informatique et des Libertés (CIL) ; ailleurs, l’autorité de protection des données de votre pays.
      </p>

      <h2>11. Enfants</h2>
      <p>Les comptes restaurateurs sont réservés aux adultes. Les menus publics peuvent être consultés par tous, sans création de compte.</p>

      <h2>12. Modifications</h2>
      <p>
        Nous pouvons mettre à jour cette politique. La date d’entrée en vigueur figure en haut de la page ; en cas de changement important, nous prévenons les
        restaurateurs dans leur espace ou par e-mail.
      </p>
    </>
  );
}

export function PrivacyEn() {
  return (
    <>
      <p>
        {LEGAL.product} is a digital menu, ordering and dining-room platform for restaurants. It is a product of {LEGAL.publisher}
        {LEGAL.legalForm ? ` (${LEGAL.legalForm})` : ""}, a company based in the {LEGAL.country.en} and part of {LEGAL.parentGroup} (“we”). This policy
        explains what data we process, why, with whom, for how long, and your rights.
      </p>

      <h2>1. Who is concerned?</h2>
      <ul>
        <li>
          <strong>Restaurant owners and managers</strong> who create a {LEGAL.product} account.
        </li>
        <li>
          <strong>Restaurant staff</strong> (servers, kitchen, cashier) when the restaurant creates a profile for them.
        </li>
        <li>
          <strong>Restaurant customers</strong> who view a menu, pick a seat or place an order. They do not need an account.
        </li>
      </ul>

      <h2>2. Who is responsible?</h2>
      <p>
        {LEGAL.publisher} is the controller for restaurant accounts and the operation of the platform. For data about a restaurant’s customers (orders,
        reservations, a first name given at the counter, a phone number for delivery), <strong>the restaurant</strong> is the controller and {LEGAL.publisher}{" "}
        acts on its behalf as a processor.
      </p>

      <h2>3. Data we process</h2>
      <table>
        <thead>
          <tr>
            <th>People</th>
            <th>Data</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Restaurant owners</td>
            <td>Name, email address, profile picture, sign-in identifier (from our authentication service, or from Google if you choose “Continue with Google”, see section 5), role in the restaurant.</td>
            <td>Create and secure your account, give you access to your restaurant.</td>
          </tr>
          <tr>
            <td>Restaurants</td>
            <td>Name, address, city, phone numbers, WhatsApp, Orange Money and Moov Money numbers, opening hours, menu, photos, logo, tables and rooms.</td>
            <td>Show the public menu and run the service. This information is public once the menu is published.</td>
          </tr>
          <tr>
            <td>Staff</td>
            <td>Name, photo (optional), role, phone, PIN code (stored only in hashed form), sign-in times and actions taken.</td>
            <td>Sign-in without email on the restaurant’s devices, knowing who did what.</td>
          </tr>
          <tr>
            <td>Restaurant customers</td>
            <td>
              A random device identifier (no name), the chosen seat, the selection and orders, and when needed a first name (counter), an address and phone
              number (delivery), a name and number (reservation).
            </td>
            <td>Link a phone to a table, share a bill, track an order, contact the customer about their order or reservation.</td>
          </tr>
          <tr>
            <td>Everyone</td>
            <td>Technical logs (date, IP address, page requested, errors).</td>
            <td>Security, abuse prevention (request rate limits) and fixing problems.</td>
          </tr>
        </tbody>
      </table>
      <p>We do not sell your data, we do not do targeted advertising, and we use no third-party analytics.</p>

      <h2>4. Legal bases</h2>
      <ul>
        <li>Performance of the contract with restaurants (account, menu, orders, reservations).</li>
        <li>Our legitimate interest in securing the service and preventing abuse.</li>
        <li>Our legal obligations (for example accounting) where they apply.</li>
      </ul>

      <h2>5. Sign-in with Google</h2>
      <p>Restaurant owners can sign in with their Google account (“Continue with Google”). In that case:</p>
      <ul>
        <li>
          <strong>Data we receive from Google</strong>: only your name, email address, profile picture and a Google account identifier (the “openid”, “email”
          and “profile” permissions). We do not access your Gmail messages, contacts, Drive files, calendar or any other data in your Google account.
        </li>
        <li>
          <strong>How we use it</strong>: only to create your {LEGAL.product} account, recognise you each time you sign in, show your name in your area and
          contact you about your account.
        </li>
        <li>
          <strong>Sharing</strong>: this data is passed to our authentication provider (Clerk) and stored in our database hosted by Replit, only to provide the
          service. We do not sell it, use it for advertising, transfer it to data brokers, or use it to train artificial intelligence models.
        </li>
        <li>
          <strong>Retention and deletion</strong>: it is kept while your account exists. You can ask us to delete your account (section 10); your Google data is
          then deleted from our systems. You can also remove {LEGAL.product}’s access to your Google account at any time at{" "}
          <a href={GOOGLE_PERMISSIONS_URL} className="underline" rel="noopener">
            myaccount.google.com/permissions
          </a>
          .
        </li>
        <li>
          {LEGAL.product}’s use and transfer of information received from Google APIs will adhere to the{" "}
          <a href={GOOGLE_USER_DATA_POLICY_URL} className="underline" rel="noopener">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </li>
      </ul>

      <h2>6. Service providers and hosting locations</h2>
      <ul>
        <li>
          <strong>Replit</strong>: application hosting, database and photo storage (infrastructure outside Burkina Faso, including the United States).
        </li>
        <li>
          <strong>Clerk</strong>: authentication of restaurant owners (accounts and sign-in sessions), United States.
        </li>
        <li>
          <strong>Google</strong>: only if you choose “Continue with Google” (see section 5).
        </li>
      </ul>
      <p>
        As {LEGAL.publisher} is based in the {LEGAL.country.en} and our providers host data there, your data is processed and stored in the{" "}
        {LEGAL.country.en}, outside Burkina Faso. We choose providers that apply recognised security measures and send them only what is necessary.
      </p>
      <p>
        “WhatsApp” links (contact, takeaway order, sharing) open WhatsApp on your phone: a message is only sent if you send it yourself, and it is then subject
        to WhatsApp’s (Meta’s) rules. Orange Money and Moov Money payments currently happen outside {LEGAL.product} and are confirmed by hand by the restaurant.
      </p>

      <h2>7. Cookies and storage on your device</h2>
      <p>We only use what the service needs to work — no advertising or analytics cookies:</p>
      <ul>
        <li>Sign-in cookies from our authentication service (restaurant owners only).</li>
        <li>“NEXT_LOCALE”: the language chosen in the restaurant area.</li>
        <li>“rc_restaurant”: the active restaurant when you manage several.</li>
        <li>
          On public menus, the browser’s local storage keeps: the random device identifier, the language and selection of the current visit, the chosen seat,
          and the “data saver” mode. This stays on your phone; you can clear it from your browser settings.
        </li>
        <li>A copy of the menu and photos may be kept on the phone so it works offline.</li>
      </ul>

      <h2>8. Retention</h2>
      <ul>
        <li>Accounts and restaurant data: for the life of the account, then deleted within 90 days after the account is closed, unless the law requires otherwise.</li>
        <li>An unpaid plan never deletes data: the menu stays visible and the account can be reactivated.</li>
        <li>Seats and table sessions: closed automatically after a few hours of inactivity; their records are kept at most 12 months.</li>
        <li>Orders, payments and reservations: as required by the restaurant’s accounting obligations, at most 10 years.</li>
        <li>Technical and audit logs: 12 months.</li>
      </ul>

      <h2>9. Security</h2>
      <p>
        Encrypted connections (HTTPS), strict separation of each restaurant’s data, permission checks on every action, PIN codes and tokens stored in hashed
        form, a log of who did what, and request limits on public pages. No system is perfectly secure; we will inform you of any incident that affects you.
      </p>

      <h2>10. Your rights</h2>
      <p>
        You can ask to access, correct or delete your data, or object to processing. For data processed for a restaurant (for example an order), contact the
        restaurant first; we will help it answer. To exercise your rights, contact us:
      </p>
      <Contact lang="en" />
      <p>
        We answer within 30 days. If you are in Burkina Faso, you can also contact the data protection authority, the Commission de l’Informatique et des
        Libertés (CIL); elsewhere, your country’s data protection authority.
      </p>

      <h2>11. Children</h2>
      <p>Restaurant accounts are for adults only. Public menus can be viewed by anyone, without an account.</p>

      <h2>12. Changes</h2>
      <p>
        We may update this policy. The effective date is shown at the top of the page; for significant changes we notify restaurant owners in their area or by
        email.
      </p>
    </>
  );
}
