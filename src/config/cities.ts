/**
 * Towns of Burkina Faso offered when creating a business (and in Paramètres). The two big
 * cities first, then A–Z. « Autre ville » lets people type any other place.
 */
export const BF_CITIES_TOP = ["Ouagadougou", "Bobo-Dioulasso"] as const;

export const BF_CITIES_OTHER = [
  "Arbinda", "Banfora", "Batié", "Bittou", "Bogandé", "Boromo", "Boulsa", "Dano", "Dédougou", "Diapaga",
  "Diébougou", "Djibo", "Dori", "Fada N’Gourma", "Gaoua", "Garango", "Gorom-Gorom", "Gourcy", "Houndé", "Kantchari",
  "Kaya", "Kombissiri", "Kongoussi", "Koudougou", "Koupéla", "Léo", "Manga", "Manni", "Niangoloko", "Nouna",
  "Orodara", "Ouahigouya", "Pama", "Pô", "Pouytenga", "Réo", "Saaba", "Sapouy", "Sebba", "Sindou",
  "Solenzo", "Tenkodogo", "Titao", "Toma", "Tougan", "Yako", "Zabré", "Ziniaré", "Zorgho",
] as const;

export const BF_CITIES: readonly string[] = [...BF_CITIES_TOP, ...BF_CITIES_OTHER];
