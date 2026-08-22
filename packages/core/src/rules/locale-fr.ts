/**
 * French wording for our own rules.
 *
 * Kept apart from the rule definitions, exactly as axe keeps its locales apart:
 * a rule file should read as logic, and a translator should be able to work
 * without touching one.
 *
 * Applied inside the page, before the rules run, so that everything downstream —
 * console, HTML report, RGAA grid, JSON — speaks one language without anyone
 * translating the same sentence twice.
 */
export interface RuleWording {
  message: string;
  help: string;
  recommendation: string;
  /**
   * Wording for one occurrence, with `{key}` placeholders filled from the
   * finding's own data.
   *
   * A template rather than a function: the locale crosses into the page as
   * JSON, where a function would not survive the trip.
   */
  detail?: string;
}

export type RuleLocale = Readonly<Record<string, RuleWording>>;

export const RULES_FR: RuleLocale = {
  'rgaa-lang-mismatch': {
    message: 'La langue déclarée ne correspond pas à celle du contenu',
    help: "Un lecteur d'écran choisit ses règles de prononciation d'après la langue déclarée : une incohérence rend la page inintelligible, et pas seulement accentuée.",
    recommendation:
      "Renseignez l'attribut lang de <html> avec la langue réellement utilisée dans la page.",
    detail: 'La page déclare lang="{declared}" mais son contenu se lit comme du {detected}',
  },
  'rgaa-placeholder-page-title': {
    message: 'Le titre de page est un texte par défaut, pas une description de la page',
    help: "Le titre est la première chose annoncée au chargement, et l'intitulé de l'onglet comme des favoris : un texte par défaut les rend tous inutiles.",
    recommendation:
      "Donnez un titre décrivant cette page en particulier, et non l'application en général.",
    detail: 'Le titre de page est « {title} »',
  },
  'rgaa-skip-link-missing': {
    message: "Aucun lien d'évitement vers le contenu principal",
    help: "Sans lui, une personne naviguant au clavier doit parcourir tout l'en-tête et le menu sur chaque page avant d'atteindre le contenu.",
    recommendation:
      'Ajoutez en tout début de page un lien pointant vers le contenu principal, visible au moins lors de la prise de focus.',
  },
  'rgaa-group-without-fieldset': {
    message: 'Des champs de même nature ne sont pas regroupés sous une légende',
    help: "Chaque champ peut être étiqueté et l'ensemble rester incompréhensible : sans regroupement, on entend les options mais jamais la question à laquelle elles répondent.",
    recommendation:
      "Entourez le groupe d'un <fieldset> avec une <legend>, ou utilisez role=\"group\" avec un nom accessible.",
    detail: '{count} champs « {name} » ne sont pas regroupés sous une légende',
  },
  'rgaa-missing-autocomplete': {
    message: "Un champ demandant des données personnelles n'a pas de jeton autocomplete",
    help: 'Ce jeton permet au navigateur de remplir le champ, ce qui compte surtout pour les personnes dont la saisie est lente ou douloureuse.',
    recommendation:
      'Ajoutez un attribut autocomplete nommant ce que le champ collecte, par exemple autocomplete="email".',
    detail: 'Attendu : autocomplete="{token}"',
  },
  'rgaa-link-not-explicit': {
    message: "L'intitulé du lien peut ne pas être explicite hors contexte",
    help: "Les utilisateurs de lecteurs d'écran naviguent souvent en listant tous les liens de la page, où « en savoir plus » répété douze fois est indiscernable.",
    recommendation:
      'Reformulez le lien pour nommer sa destination, ou vérifiez que le contexte le rend explicite.',
    detail: "Le lien n'affiche que « {text} »",
  },
  'rgaa-duplicate-link-text': {
    message: 'Plusieurs liens portent le même intitulé mais mènent à des endroits différents',
    help: 'Dans une liste de liens, un intitulé identique pour des destinations différentes ne laisse aucun moyen de les distinguer.',
    recommendation:
      'Faites que chaque intitulé nomme sa propre destination, ou vérifiez que le contexte les distingue.',
    detail: '« {text} » mène à {count} destinations différentes',
  },
};
