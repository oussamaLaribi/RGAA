# Contribuer

## Démarrer

```bash
npm install
npm run build
npm test
npm run typecheck        # typage strict, tests inclus
npm run verify:bridge    # preuve bout en bout à travers un vrai build Angular AOT
```

L'application de test vit dans `apps/fixture-app`. Elle est **délibérément
inaccessible** : chaque violation y sert de cas de test. Si vous la modifiez,
vérifiez que `npm run verify:bridge` passe toujours.

## Essayer l'outil en local

Trois niveaux, du plus rapide au plus fidèle.

**1. Sans rien installer** — pour itérer pendant le développement :

```bash
npm run build
node packages/cli/dist/index.js check --project /chemin/vers/mon-app --no-fail
```

**2. Comme une vraie commande** — pour l'usage quotidien :

```bash
npm run build
npm link --workspace @rgaa-source/cli
rgaa-source check --project . --no-fail     # depuis n'importe quel dossier
```

`npm unlink -g @rgaa-source/cli` pour retirer le lien. Attention : un lien
résout les dépendances à travers l'espace de travail, donc il **masque** un
`files` incomplet ou une dépendance oubliée. Il ne remplace pas le niveau 3.

**3. Répétition générale sur un registre local** — la seule qui prouve que la
publication elle-même fonctionne. À refaire avant chaque version.

```bash
npm install -g verdaccio
verdaccio --listen 4873 &
```

Créer un compte sans invite interactive, et écrire un `.npmrc` **local au dépôt**
(il contient un jeton ; il est dans le `.gitignore`, ne le committez jamais) :

```bash
TOKEN=$(curl -s -XPUT -H "Content-Type: application/json" \
  -d '{"name":"local","password":"local-test-only","email":"local@example.test","type":"user","roles":[],"date":"2026-01-01T00:00:00.000Z"}' \
  http://localhost:4873/-/user/org.couchdb.user:local | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

printf '@rgaa-source:registry=http://localhost:4873/\n//localhost:4873/:_authToken=%s\n' "$TOKEN" > .npmrc
```

Publier dans l'ordre des dépendances — chaque paquet dépend des précédents, et
npm refuse une dépendance vers une version absente du registre :

```bash
npm run build
for p in core angular fix report cli; do
  (cd packages/$p && npm publish --registry http://localhost:4873/)
done
```

Puis, dans un dossier de test vierge, installer **comme un vrai utilisateur** :
pas de `file:`, pas d'`overrides`, npm résout tout seul.

```bash
npm init -y
printf '@rgaa-source:registry=http://localhost:4873/\n' > .npmrc
npm install @rgaa-source/cli
npx rgaa-source check --project /chemin/vers/mon-app --no-fail
```

Ce niveau vérifie ce que les deux autres masquent : que `files` embarque bien
`rules.bundle.js`, que le binaire démarre avec son shebang, que Playwright et
axe-core s'installent chez le consommateur, et que les plages de versions entre
paquets se résolvent réellement.

Pour arrêter le registre, il écoute en IPv6 — `netstat -ano | grep 4873` puis
`taskkill /F /PID <pid>` sous Windows.

## Ajouter une option

Une option est trois choses : une entrée dans `parseArgs` (**sans `default`**,
voir plus bas), une clé dans `Config` avec son validateur, et une ligne dans le
texte d'aide.

Aucune option booléenne ne déclare de valeur par défaut au parseur : avec une,
un drapeau absent et un drapeau explicitement à faux sont indiscernables, et le
fichier de configuration ne pourrait jamais être surchargé dans les deux sens.
Absent vaut `undefined`, et `pick(drapeau, fichier, défaut)` tranche.

## Ajouter une règle

Une règle est un fichier dans `packages/core/src/rules/` et une ligne dans
`registry.ts`. Le scanner n'est jamais touché.

```ts
export const maRegle: AccessibilityRule = {
  id: 'rgaa-ma-regle',
  severity: 'moderate',
  wcag: ['1.3.1'],
  rgaa: ['9.3'],          // déclaré, jamais déduit
  message: '…',
  help: '…',              // pourquoi ça compte, pour un développeur non-expert
  recommendation: '…',    // quoi faire
  run({ document }) {
    const candidats = [...document.querySelectorAll('…')];
    return { candidates: candidats.length, findings: [] };
  },
};
```

Quatre points à respecter :

- **`candidates` est le dénominateur du score.** Une page sans tableau ne doit
  être ni récompensée ni pénalisée par une règle sur les tableaux. Renvoyez `0`
  quand la règle n'a rien à examiner.
- **N'ajoutez pas ce qu'axe fait déjà bien.** Dupliquer une règle existante
  n'ajoute que des occasions d'être en désaccord avec elle.
- **`review: true`** pour ce qui ne peut être que signalé à un humain. Ces
  règles ne produisent pas d'échecs et n'entrent pas dans le score.
- **Transmettez ce que vous détectez** via `data`, pour qu'un correcteur agisse
  sur la valeur plutôt que de ré-analyser une phrase.

Les règles tournent dans la page : uniquement des API navigateur, rien de Node.
Elles sont empaquetées par `scripts/bundle-rules.mjs`.

Tests : `packages/core/src/rules/rules.test.ts`, en environnement `happy-dom`.
Toute règle doit avoir un cas qui la déclenche **et** un cas qui ne la déclenche
pas — une règle qui tire sur une page saine tirera partout.

## Ajouter un correcteur

Un correcteur est une entrée dans `packages/fix/src/fixers.ts`. Le niveau
`safe` est réservé à ce qui est correct **sans rien savoir du sens de la page**.
Tout ce qui consiste à écrire un texte descriptif est `suggested` : une
alternative fausse est pire que l'attribut manquant, parce que le lecteur
d'écran la croit.

## Principes non négociables

Ces quatre points ont chacun été payés par un bug ou une mauvaise décision
rattrapée. Les remettre en cause demande un argument, pas une préférence.

1. **Exact ou absent, jamais deviné.** Un développeur envoyé à la mauvaise ligne
   perd plus de temps qu'un développeur envoyé nulle part. Les localisations
   viennent d'un attribut posé au build, jamais d'une correspondance approchée.

2. **Ne jamais déclarer un critère conforme.** Un contrôle automatique couvre
   une fraction des tests d'un critère. La grille n'émet que `NC` et `NT`.

3. **Ne jamais laisser un arbre de travail modifié.** Les templates sont
   réécrits en place ; l'original est déposé sur disque avant, et restauré dans
   un `finally`. Un garde-fou qui se déclenche à tort finit désactivé — d'où la
   récupération automatique plutôt qu'un refus de tourner.

4. **Dire ce qui n'a pas été vérifié.** Chaque rapport affiche les critères sur
   lesquels il ne s'est pas prononcé. C'est ce qui empêche le score d'être lu
   comme un taux de conformité.

## Le référentiel RGAA

`packages/core/src/mapping/rgaa-criteria.generated.ts` est **généré**. Ne
l'éditez pas : lancez `npm run build:rgaa`, qui le reconstruit depuis la source
officielle DINUM et échoue s'il ne retrouve pas exactement 106 critères sur
13 thématiques. Relisez le diff — un changement ici change ce que tout audit cite.

Le mapping règle → critères dans `rgaa.ts` se justifie contre l'intitulé
officiel du critère, pas de mémoire. Un test vérifie qu'aucune règle ne cite un
critère absent du référentiel.
