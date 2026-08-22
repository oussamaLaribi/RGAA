/**
 * Regenerate the README images from the tool's real output.
 *
 * Run after any change to what the CLI prints. Hand-drawn screenshots drift from
 * the product within a release or two, and a README showing output the tool no
 * longer produces is worse than one with no image at all.
 *
 *   node scripts/build-docs-images.mjs <chemin/vers/un/projet/angular>
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const projet = process.argv[2];

if (!projet) {
  process.stderr.write('usage : node scripts/build-docs-images.mjs <projet-angular>\n');
  process.exit(2);
}

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

const analyse = lancer(['check', '--project', projet]);
const correction = lancer(['check', '--project', projet, '--fix-suggested', '--dry-run']);

rendre(
  analyse.slice(2, 20),
  'analyse.svg',
  "Résultat d'une analyse : chaque violation avec son fichier, sa ligne, sa gravité et les critères RGAA concernés",
);
rendre(
  analyse.slice(-12),
  'couverture.svg',
  "Résumé : score de pré-audit et part du référentiel RGAA sur laquelle l'analyse ne s'est pas prononcée",
);
rendre(
  correction.slice(-23, -4),
  'correction.svg',
  'Correctifs proposés, affichés en diff avant toute écriture dans le code',
);

process.stderr.write('images régénérées dans docs/\n');
