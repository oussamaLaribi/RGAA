/**
 * Regenerate the README images from the tool's real output.
 *
 * Run after any change to what the CLI prints. Hand-drawn screenshots drift from
 * the product within a release or two, and a README showing output the tool no
 * longer produces is worse than one with no image at all.
 *
 *   node scripts/build-docs-images.mjs <chemin/vers/un/projet/angular> [fr|en]
 *
 * The language is part of the picture. The README exists in both, and a French
 * capture on the English page would advertise output that reader will not get.
 * English images are written alongside the French ones with an `.en` infix.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const projet = process.argv[2];
const langue = process.argv[3] ?? 'fr';

if (!projet || !['fr', 'en'].includes(langue)) {
  process.stderr.write('usage : node scripts/build-docs-images.mjs <projet-angular> [fr|en]\n');
  process.exit(2);
}

// French keeps the bare filenames: it was there first, and renaming its images
// would break every README and release note already pointing at them.
const suffixe = langue === 'fr' ? '' : `.${langue}`;

mkdirSync(join(racine, 'docs'), { recursive: true });

const cli = join(racine, 'packages/cli/dist/index.js');

// FORCE_COLOR because the output is piped: without it the capture comes out
// grey and the image loses the severity colours that make it readable at a
// glance — which is the entire reason for showing an image rather than text.
const env = { ...process.env, FORCE_COLOR: '1' };

/**
 * Exit code 1 is the expected outcome here: the demonstration project is
 * deliberately inaccessible, and outside a terminal the scan blocks on what it
 * finds. Only a code 2 — the scan itself failing — is a real error.
 */
const lancer = (args) => {
  try {
    return execFileSync(process.execPath, [cli, ...args], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n');
  } catch (erreur) {
    if (erreur.status === 1 && typeof erreur.stdout === 'string') return erreur.stdout.split('\n');
    throw erreur;
  }
};

const rendre = (lignes, sortie, titre) =>
  execFileSync(
    process.execPath,
    [join(racine, 'scripts/render-terminal-svg.mjs'), join(racine, 'docs', sortie), titre],
    { input: lignes.join('\n'), encoding: 'utf8', stdio: ['pipe', 'ignore', 'inherit'] },
  );

const analyse = lancer(['check', '--project', projet, '--lang', langue]);
const correction = lancer([
  'check',
  '--project',
  projet,
  '--lang',
  langue,
  '--fix-suggested',
  '--dry-run',
]);

// These become the alt text of each image, so they follow the language too:
// a screen reader on the English page must not be handed a French sentence.
const titres = {
  fr: {
    analyse:
      "Résultat d'une analyse : chaque violation avec son fichier, sa ligne, sa gravité et les critères RGAA concernés",
    couverture:
      "Résumé : score de pré-audit et part du référentiel RGAA sur laquelle l'analyse ne s'est pas prononcée",
    correction: 'Correctifs proposés, affichés en diff avant toute écriture dans le code',
  },
  en: {
    analyse:
      'Scan output: every violation with its file, its line, its severity and the RGAA criteria it bears on',
    couverture:
      'Summary: the pre-audit score, and the share of the RGAA reference the scan did not rule on',
    correction: 'Proposed fixes, shown as a diff before anything is written to the code',
  },
};
const titre = titres[langue];

rendre(analyse.slice(2, 20), `analyse${suffixe}.svg`, titre.analyse);
rendre(analyse.slice(-12), `couverture${suffixe}.svg`, titre.couverture);
rendre(correction.slice(-23, -4), `correction${suffixe}.svg`, titre.correction);

process.stderr.write(`images régénérées dans docs/ (${langue})\n`);
