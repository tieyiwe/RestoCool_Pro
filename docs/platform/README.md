# RestoCool platform documentation

RestoCool is a TIBLOGICS product: a digital menu, ordering, reservation and management platform for restaurants, maquis, bars, hotels, cafés and VIP bus companies in Burkina Faso.

These documents describe the platform as it works today. Screen labels are quoted in French, exactly as they appear in the app, so you can find them on screen.

| # | Document | For whom |
|---|---|---|
| 1 | [Platform overview](01-platform-overview.md) | Everyone (start here) |
| 2 | [Features list](02-features-list.md) | Sales, support, owners |
| 3 | [SOP: onboarding a business](03-sop-onboarding-a-business.md) · [version française](03-sop-onboarding-a-business.fr.md) | Sales agents, support, owners |
| 4 | [SOP: daily operations in a business](04-sop-daily-operations.md) | Owners, managers, staff trainers |
| 5 | [SOP: platform administration (console)](05-sop-platform-administration.md) | TIBLOGICS team |
| 6 | [Sales and onboarding playbook](06-sales-and-onboarding-playbook.md) | Field sales agents |
| 7 | [Quick guides by profile](07-quick-guides-by-profile.md) | Owners training their team |
| 8 | [Connecting mobile money (online payment)](08-connecting-mobile-money.md) | Owners, TIBLOGICS team |

## Downloads

Every document is also available as **PDF** (to print or send) and **Word** (to edit), in [`downloads/`](downloads/):

| Document | PDF | Word |
|---|---|---|
| 1. Platform overview | [PDF](downloads/01-platform-overview.pdf) | [DOCX](downloads/01-platform-overview.docx) |
| 2. Features list | [PDF](downloads/02-features-list.pdf) | [DOCX](downloads/02-features-list.docx) |
| 3. SOP: onboarding a business | [PDF](downloads/03-sop-onboarding-a-business.pdf) | [DOCX](downloads/03-sop-onboarding-a-business.docx) |
| 3. Procédure : mettre en service un établissement (FR) | [PDF](downloads/03-sop-onboarding-a-business.fr.pdf) | [DOCX](downloads/03-sop-onboarding-a-business.fr.docx) |
| 4. SOP: daily operations | [PDF](downloads/04-sop-daily-operations.pdf) | [DOCX](downloads/04-sop-daily-operations.docx) |
| 5. SOP: platform administration | [PDF](downloads/05-sop-platform-administration.pdf) | [DOCX](downloads/05-sop-platform-administration.docx) |
| 6. Sales and onboarding playbook | [PDF](downloads/06-sales-and-onboarding-playbook.pdf) | [DOCX](downloads/06-sales-and-onboarding-playbook.docx) |
| 7. Quick guides by profile | [PDF](downloads/07-quick-guides-by-profile.pdf) | [DOCX](downloads/07-quick-guides-by-profile.docx) |
| 8. Connecting mobile money | [PDF](downloads/08-connecting-mobile-money.pdf) | [DOCX](downloads/08-connecting-mobile-money.docx) |

All of them in one file: [`restocool-documentation.zip`](downloads/restocool-documentation.zip).

Document 3 has a styled layout and a French version (build steps in [`build/`](build/README.md)). The Markdown files (`0*.md`) are the source: edit them, then rebuild the downloads (pandoc for Word, the browser's « print to PDF » or the same pandoc + Chromium steps for PDF).

Related technical notes: [`docs/BACKUP.md`](../BACKUP.md) (backups and restore), [`CLAUDE.md`](../../CLAUDE.md) (build decisions).

**Keep these documents true.** When a feature changes, update the matching section here and the in-app tutorial (`/app/guide`) in the same change.
