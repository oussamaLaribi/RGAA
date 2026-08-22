import { CONFIG_FILENAME } from './config.js';
import type { Lang } from './i18n.js';

/**
 * The help text, in both languages.
 *
 * Kept out of the dictionary because it is one long block per language rather
 * than a set of interchangeable sentences: splitting it into keys would make it
 * unreadable to write and impossible to keep aligned.
 */
const FR = `
rgaa-source — analyse d'accessibilité qui rapporte la ligne de code, pas un sélecteur CSS

Commandes
  rgaa-source check <url...>          analyser des pages déjà servies
  rgaa-source check --project <dir>   instrumenter, compiler, servir et analyser un projet Angular
  rgaa-source criteria                les critères RGAA qu'un contrôle automatique peut atteindre

Options
  --project <dossier>   projet Angular à instrumenter et compiler
  --route <chemin>      route à analyser en mode projet (répétable, / par défaut)
  --min-score <n>       échouer quand une page passe sous n
  --fail                sortir en 1 sur ce qui est trouvé (le défaut hors terminal, donc en CI)
  --no-fail             toujours sortir en 0, quoi qu'il soit trouvé
  --lang <fr|en>        langue de la sortie (fr par défaut)
  --json <fichier>      écrire les résultats complets en JSON
  --html <fichier>      écrire un rapport autonome à transmettre
  --grid <fichier>      écrire la grille d'évaluation RGAA en CSV
  --baseline <fichier>  comparer à une référence et n'échouer que sur ce qui est nouveau
  --browser <canal>     canal Playwright (msedge par défaut ; chromium pour le téléchargé)
  --violations-only     plus rapide, mais désactive le score
  --reuse-build         servir le dist existant sans instrumenter ni compiler
  --force               écrire même si l'arbre de travail n'est pas récupérable
  --verbose             lister toutes les occurrences, et afficher la sortie de compilation
  --config <fichier>    lire les réglages ici plutôt que dans ./${CONFIG_FILENAME}
  --no-config           ignorer tout fichier de configuration

Correction (mode projet uniquement)
  --fix                 écrire les correctifs qui ne demandent aucun jugement
  --fix-suggested       rédiger aussi ceux dont vous devrez écrire les mots
  --dry-run             montrer le diff et n'écrire rien
  -h, --help

Codes de sortie
  0  rien trouvé, ou le seuil est tenu
  1  violations trouvées, ou score sous --min-score
  2  l'analyse elle-même n'a pas pu s'exécuter

Configuration
  Les réglages qu'un projet répète peuvent vivre dans ${CONFIG_FILENAME},
  à côté du package.json :

    { "project": ".", "routes": ["/", "/contact"], "minScore": 80 }

  Un drapeau l'emporte toujours sur le fichier.

Les localisations n'apparaissent que sur une compilation instrumentée. Analyser une
URL quelconque rapporte les violations, mais ne peut les rattacher à aucun fichier.
`.trim();

const EN = `
rgaa-source — accessibility scan that reports the line of code, not a CSS selector

Commands
  rgaa-source check <url...>          scan pages that are already served
  rgaa-source check --project <dir>   instrument, build, serve and scan an Angular project
  rgaa-source criteria                the RGAA criteria an automated check can reach

Options
  --project <dir>       Angular project to instrument and build
  --route <path>        route to scan in project mode (repeatable, default /)
  --min-score <n>       fail when a page scores below n
  --fail                exit 1 on findings (the default outside a terminal, e.g. CI)
  --no-fail             always exit 0, whatever is found
  --lang <fr|en>        language of the output (default fr)
  --json <file>         write the full results as JSON
  --html <file>         write a self-contained report to hand over
  --grid <file>         write the RGAA evaluation grid as CSV
  --baseline <file>     compare against a reference and fail only on what is new
  --browser <channel>   Playwright channel (default msedge; pass chromium for the download)
  --violations-only     faster, but disables scoring
  --reuse-build         serve the existing dist without instrumenting or building
  --force               write even when the working tree is not recoverable
  --verbose             list every occurrence, and stream the build output
  --config <file>       read settings from this file instead of ./${CONFIG_FILENAME}
  --no-config           ignore any configuration file

Fixing (project mode only)
  --fix                 write the fixes that need no judgement
  --fix-suggested       also draft the ones whose wording you must supply
  --dry-run             show the diff and write nothing
  -h, --help

Exit codes
  0  nothing found, or the gate passed
  1  violations found, or the score is below --min-score
  2  the scan itself could not run

Configuration
  Settings a project repeats can live in ${CONFIG_FILENAME}, next to package.json:

    { "project": ".", "routes": ["/", "/contact"], "minScore": 80 }

  A flag always wins over the file.

Source locations only appear for pages built from instrumented templates. A scan
of an arbitrary URL still reports violations, but cannot trace them to a file.
`.trim();

export function usage(lang: Lang): string {
  return lang === 'en' ? EN : FR;
}
