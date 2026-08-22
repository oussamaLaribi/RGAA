export type Lang = 'fr' | 'en';

/**
 * Every string this tool says for itself.
 *
 * Typed as one record so the compiler refuses a language that is missing a key.
 * The rule wording is not here: axe and our own rules are translated inside the
 * page, before they produce anything, so the console, the HTML report, the RGAA
 * grid and the JSON all come out in one language without a second pass.
 */
export interface Messages {
  // progress
  instrumenting: (count: number) => string;
  building: string;
  serving: (origin: string) => string;
  scanning: (label: string) => string;
  located: (elements: number, templates: number) => string;
  recovered: (path: string) => string;
  skippedTemplate: (path: string, error: string) => string;
  wrote: (path: string) => string;
  baselineRecorded: (path: string) => string;
  ruleFailed: (ruleId: string, error: string) => string;
  axeFailed: (label: string, error: string) => string;
  nothingToScan: string;
  fixNeedsProject: string;

  // report
  noViolations: string;
  notTraced: string;
  notTracedWhy: readonly string[];
  moreOf: (count: number, ruleId: string) => string;
  score: (value: number) => string;
  nothingFound: string;
  needHuman: (count: number) => string;
  needHumanWhy: string;
  criteriaExamined: (seen: number, total: number) => string;
  failing: (count: number) => string;
  needReview: (count: number) => string;
  notCovered: (count: number) => string;
  disclaimer: readonly string[];
  engineLine: (engine: string, scoring: number, rules: number) => string;
  gateHint: string;

  // fixes
  fixNothing: string;
  fixWritten: (count: number, files: number) => string;
  fixWouldWrite: (count: number, files: number) => string;
  fixNothingChanged: string;
  fixNeedWords: (count: number, marker: string) => string;
  fixWithheld: (count: number, rules: string) => string;
  fixWithheldHow: string;
  fixNoFixer: (rules: string) => string;
  fixUntraceable: (count: number) => string;

  /**
   * Wording for each fixer, keyed by rule.
   *
   * The fixers live in a framework-agnostic package that knows nothing about
   * languages; translating here keeps that package free of presentation and
   * leaves one place to look for every string this tool says.
   *
   * A rule absent from the map falls back to the fixer's own description, so a
   * new fixer degrades to English rather than to nothing.
   */
  fixDescriptions: Readonly<Record<string, string>>;

  // baseline comparison
  regressionTitle: string;
  regressionNone: string;
  regressionNew: (count: number) => string;
  regressionResolved: (count: number) => string;
  regressionCarried: (count: number) => string;

  // criteria command
  criteriaReach: (reached: number, total: number, percent: number) => string;
  criteriaRest: string;

  // errors the user sees
  badLang: string;
  badScore: string;
  unknownCommand: (name: string) => string;
  configMissing: (path: string) => string;
  configNotJson: (path: string, why: string) => string;
  configNotObject: (path: string) => string;
  configUnknownKey: (key: string) => string;
  configBadValue: (key: string) => string;
  notAngular: (path: string) => string;
  noBuildOutput: (path: string) => string;
  noIndexHtml: (path: string) => string;
  buildFailed: string;
  browserLaunch: (channel: string) => string;
  binNotFound: (name: string, path: string) => string;
  guardDirty: (count: number) => string;
  guardHow: string;
  guardScan: string;
  guardFix: string;
  errorPrefix: (message: string) => string;

  // severities
  severity: Record<'critical' | 'serious' | 'moderate' | 'minor', string>;
}

const FR: Messages = {
  instrumenting: (n) => `instrumentation de ${n} template(s)`,
  building: 'compilation du projet',
  serving: (origin) => `service sur ${origin}`,
  scanning: (label) => `analyse de ${label}`,
  located: (e, t) => `${e} élément(s) localisé(s) dans ${t} template(s)`,
  recovered: (p) => `${p} restauré après une exécution interrompue`,
  skippedTemplate: (p, e) => `template illisible ignoré ${p} : ${e}`,
  wrote: (p) => `écrit ${p}`,
  baselineRecorded: (p) =>
    `aucune référence à ${p} ; cette exécution est enregistrée comme référence`,
  ruleFailed: (id, e) => `la règle ${id} a échoué : ${e}`,
  axeFailed: (label, e) => `axe a échoué sur ${label} : ${e}`,
  nothingToScan: 'rien à analyser : passez une URL, ou --project <dossier>',
  fixNeedsProject: '--fix exige --project : une URL analysée ne donne aucun code à modifier',

  noViolations: 'aucune anomalie détectée automatiquement',
  notTraced: 'non rattaché à un fichier source',
  notTracedWhy: [
    "La page n'a pas été compilée depuis des templates instrumentés, ou ces",
    "éléments ne sont écrits dans aucun : balisage tiers, ou généré à l'exécution.",
  ],
  moreOf: (n, id) => `… ${n} autre(s) pour ${id}`,
  score: (v) => `Score de pré-audit  ${v}/100`,
  nothingFound: 'rien trouvé',
  needHuman: (n) => `${n} point(s) à vérifier par un humain`,
  needHumanWhy: "— le contrôle automatique n'a pas pu trancher",
  criteriaExamined: (seen, total) => `— ${seen} critère(s) examiné(s) sur ${total}`,
  failing: (n) => `${n} en échec`,
  needReview: (n) => `${n} à vérifier`,
  notCovered: (n) => `${n} hors de portée de tout contrôle automatique`,
  disclaimer: [
    "Ceci est un pré-audit. La conformité RGAA s'établit par un audit humain ;",
    'les critères ci-dessus sont ceux concernés, et non un verdict rendu sur eux.',
  ],
  engineLine: (engine, scoring, rules) =>
    `moteur ${engine} · calcul v${scoring} · ${rules} règles appliquées`,
  gateHint:
    'Code de sortie 0 en mode interactif. En intégration continue, cette analyse échouerait — --fail pour forcer ici.',

  fixNothing: 'rien à corriger automatiquement',
  fixWritten: (n, f) => `${n} correction(s) écrite(s)` + ` dans ${f} fichier(s)`,
  fixWouldWrite: (n, f) => `${n} correction(s) seraient écrite(s) dans ${f} fichier(s)`,
  fixNothingChanged: '— rien n’a été modifié',
  fixNeedWords: (n, marker) =>
    `${n} d’entre elles attendent un texte que vous devez écrire — cherchez ${marker}`,
  fixWithheld: (n, rules) =>
    `${n} de plus pourraient être rédigées mais demandent vos mots : ${rules}`,
  fixWithheldHow: 'relancez avec --fix-suggested pour les écrire avec des marqueurs',
  fixNoFixer: (rules) => `aucune correction automatique pour : ${rules}`,
  fixUntraceable: (n) =>
    `${n} anomalie(s) n’ont pas été rattachées à un fichier et ne peuvent pas être modifiées`,

  fixDescriptions: {
    tabindex: 'retirer le tabindex positif',
    'meta-viewport': 'réautoriser le zoom',
    'rgaa-missing-autocomplete': 'ajouter le jeton autocomplete',
    'presentation-role-conflict': 'retirer le rôle de présentation sur un élément focusable',
    'html-has-lang': 'déclarer la langue de la page',
    'rgaa-lang-mismatch': 'corriger la langue déclarée par celle détectée',
    'rgaa-placeholder-page-title': 'remplacer le titre par défaut',
    'document-title': 'donner un titre à la page',
    'image-alt': 'ajouter une alternative à décrire, ou vide si décorative',
    'role-img-alt': "nommer l'image",
    'button-name': "nommer le bouton d'après ce qu'il fait",
    'link-name': "nommer le lien d'après sa destination",
    'frame-title': 'donner un titre au cadre',
    label: 'étiqueter le champ',
    'heading-order': 'ramener le titre au niveau suivant',
  },

  regressionTitle: 'Comparaison à la référence',
  regressionNone: 'aucune anomalie nouvelle',
  regressionNew: (n) => `${n} anomalie(s) nouvelle(s)`,
  regressionResolved: (n) => `${n} corrigée(s) depuis la référence`,
  regressionCarried: (n) => `${n} anomalie(s) déjà présente(s) dans la référence`,

  criteriaReach: (reached, total, percent) =>
    `${reached} critères sur ${total} sont atteignables par un contrôle automatique (${percent} %).`,
  criteriaRest:
    'Les autres exigent un humain. Aucun outil automatique ne peut établir la conformité RGAA.',

  badLang: '--lang accepte fr ou en',
  badScore: '--min-score doit être compris entre 0 et 100',
  unknownCommand: (n) => `commande inconnue « ${n} »`,
  configMissing: (p) => `fichier de configuration introuvable : ${p}`,
  configNotJson: (p, w) => `${p} n'est pas du JSON valide : ${w}`,
  configNotObject: (p) => `${p} doit contenir un objet JSON`,
  configUnknownKey: (k) => `clé inconnue « ${k} » ignorée`,
  configBadValue: (k) => `valeur invalide pour « ${k} » ignorée`,
  notAngular: (p) => `${p} ne ressemble pas à un projet Angular : pas de angular.json`,
  noBuildOutput: (p) => `aucune sortie de compilation dans ${p}`,
  noIndexHtml: (p) => `aucun index.html sous ${p}`,
  buildFailed:
    "la compilation du projet a échoué. Vérifiez que « ng build » fonctionne avant d'analyser.",
  browserLaunch: (c) =>
    `impossible de lancer ${c}. Installez-le, ou passez --browser chromium après « npx playwright install chromium ».`,
  binNotFound: (n, p) => `${n} introuvable dans ${p}. Les dépendances du projet sont-elles installées ?`,
  guardDirty: (n) => `${n} fichier(s) ont des modifications non enregistrées :`,
  guardHow:
    'Enregistrez-les ou mettez-les de côté, ou passez --force pour continuer malgré tout.',
  guardScan:
    "Les templates sont réécrits pendant l'analyse puis restaurés, mais une exécution interrompue ne pourrait pas les remettre.",
  guardFix: 'Ces correctifs réécrivent définitivement votre code source.',
  errorPrefix: (m) => `erreur : ${m}`,

  severity: {
    critical: 'critique',
    serious: 'majeur',
    moderate: 'moyen',
    minor: 'mineur',
  },
};

const EN: Messages = {
  instrumenting: (n) => `instrumenting ${n} template(s)`,
  building: 'building the project',
  serving: (origin) => `serving ${origin}`,
  scanning: (label) => `scanning ${label}`,
  located: (e, t) => `located ${e} element(s) across ${t} template(s)`,
  recovered: (p) => `recovered ${p} from an interrupted run`,
  skippedTemplate: (p, e) => `skipped unparsable template ${p}: ${e}`,
  wrote: (p) => `wrote ${p}`,
  baselineRecorded: (p) => `no baseline at ${p}; recorded this run as the reference`,
  ruleFailed: (id, e) => `rule ${id} failed: ${e}`,
  axeFailed: (label, e) => `axe failed on ${label}: ${e}`,
  nothingToScan: 'nothing to scan: pass a URL, or --project <dir>',
  fixNeedsProject: '--fix needs --project: a scanned URL gives no source tree to edit',

  noViolations: 'no automated violations',
  notTraced: 'not traced to source',
  notTracedWhy: [
    'The page was not built from instrumented templates, or these elements',
    'are not written in one — third-party markup, or generated at runtime.',
  ],
  moreOf: (n, id) => `… ${n} more of ${id}`,
  score: (v) => `Pre-audit score  ${v}/100`,
  nothingFound: 'nothing found',
  needHuman: (n) => `${n} check(s) need a human`,
  needHumanWhy: '— the automated check could not decide',
  criteriaExamined: (seen, total) => `— ${seen} of ${total} criteria examined`,
  failing: (n) => `${n} failing`,
  needReview: (n) => `${n} need a human`,
  notCovered: (n) => `${n} not covered by any automated check`,
  disclaimer: [
    'This is a pre-audit. RGAA conformance is established by human audit;',
    'the criteria above are the ones concerned, not a verdict on them.',
  ],
  engineLine: (engine, scoring, rules) =>
    `engine ${engine} · scoring v${scoring} · ${rules} rules applied`,
  gateHint:
    'Exit code 0 in interactive mode. In CI this run would fail — pass --fail to force it here.',

  fixNothing: 'nothing to fix automatically',
  fixWritten: (n, f) => `${n} fix(es) written across ${f} file(s)`,
  fixWouldWrite: (n, f) => `${n} fix(es) would be written across ${f} file(s)`,
  fixNothingChanged: '— nothing changed',
  fixNeedWords: (n, marker) => `${n} of them need text you have to write — search for ${marker}`,
  fixWithheld: (n, rules) => `${n} more could be drafted but need your words: ${rules}`,
  fixWithheldHow: 'run again with --fix-suggested to write them with placeholders',
  fixNoFixer: (rules) => `no automated fix for: ${rules}`,
  fixUntraceable: (n) =>
    `${n} violation(s) were never traced to a file and cannot be edited`,

  regressionTitle: 'Compared to the reference',
  regressionNone: 'nothing newly introduced',
  regressionNew: (n) => `${n} newly introduced`,
  regressionResolved: (n) => `${n} fixed since the reference`,
  regressionCarried: (n) => `${n} already present in the reference`,

  // Empty: the fixers already carry their English wording.
  fixDescriptions: {},

  criteriaReach: (reached, total, percent) =>
    `${reached} of ${total} criteria can be reached by an automated check (${percent}%).`,
  criteriaRest:
    'The rest require a human. No automated tool can establish RGAA conformance.',

  badLang: '--lang accepts fr or en',
  badScore: '--min-score must be between 0 and 100',
  unknownCommand: (n) => `unknown command "${n}"`,
  configMissing: (p) => `configuration file not found: ${p}`,
  configNotJson: (p, w) => `${p} is not valid JSON: ${w}`,
  configNotObject: (p) => `${p} must contain a JSON object`,
  configUnknownKey: (k) => `unknown key "${k}" ignored`,
  configBadValue: (k) => `invalid value for "${k}" ignored`,
  notAngular: (p) => `${p} does not look like an Angular project (no angular.json)`,
  noBuildOutput: (p) => `no build output at ${p}`,
  noIndexHtml: (p) => `no index.html under ${p}`,
  buildFailed: "the project's own build failed. Check that \"ng build\" works before scanning.",
  browserLaunch: (c) =>
    `could not launch ${c}. Install it, or pass --browser chromium after running "npx playwright install chromium".`,
  binNotFound: (n, p) => `could not find ${n} in ${p}. Are the project's dependencies installed?`,
  guardDirty: (n) => `${n} file(s) have uncommitted changes:`,
  guardHow: 'Commit or stash them, or pass --force to proceed anyway.',
  guardScan:
    'Templates are rewritten in place during a scan and restored afterwards, but an interrupted run could not put these back.',
  guardFix: 'These fixes rewrite your source permanently.',
  errorPrefix: (m) => `error: ${m}`,

  severity: {
    critical: 'critical',
    serious: 'serious',
    moderate: 'moderate',
    minor: 'minor',
  },
};

export function messages(lang: Lang): Messages {
  return lang === 'en' ? EN : FR;
}

/** French by default: the reference frame this tool implements is French. */
export const DEFAULT_LANG: Lang = 'fr';

export function parseLang(value: string | undefined): Lang | null {
  if (value === undefined) return DEFAULT_LANG;
  return value === 'fr' || value === 'en' ? value : null;
}
