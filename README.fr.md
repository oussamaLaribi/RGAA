[English](README.md) · **Français**

# Accessibilité RGAA — du DOM au code source

Analyse RGAA pour projets **Angular** qui rapporte **la ligne de code**, pas un
sélecteur CSS.

## Démarrage

```bash
npm install -D @rgaa-source/cli
npx rgaa-source check --project .
```

![Résultat d'une analyse : chaque violation est listée avec son fichier, sa ligne
et sa colonne, sa gravité, la règle en cause et les critères RGAA
concernés.](https://raw.githubusercontent.com/oussamaLaribi/RGAA/main/docs/analyse.svg)

Un seul prérequis : **votre projet doit compiler**. L'outil instrumente vos
templates puis lance `ng build`, donc si `npx ng build` échoue déjà, commencez
par là. Il faut aussi un navigateur pour Playwright — sous Windows il pilote
l'Edge déjà installé ; ailleurs, `npx playwright install chromium` puis
`--browser chromium`.

Comptez de vingt secondes à quelques minutes : la compilation de votre projet
domine le temps d'exécution, et l'avancement s'affiche pendant.

Pour ne pas retaper les mêmes options, un `rgaa.config.json` à côté du
`package.json` :

```json
{ "project": ".", "routes": ["/", "/contact"], "minScore": 80 }
```

Un drapeau l'emporte toujours sur le fichier. `--no-config` l'ignore.

---

Outillage d'accessibilité pour les projets **Angular**, qui répond à la question
qu'aucun scanner existant ne traite : **quelle ligne de mon code produit cette
violation ?**

Les outils actuels (axe DevTools, Lighthouse, WAVE, et côté français RGAA Lab,
Assistant RGAA, Tanaguru) s'arrêtent à un sélecteur CSS du type
`body > main > form > input.email`, qui ne correspond à aucun fichier ouvrable.
Ici, une violation détectée dans la page rendue **porte sa propre adresse
source** :

```
image sans alternative textuelle   src/app/checkout/checkout.component.html:42:8
bouton sans nom accessible         src/app/shared/icon-button.component.html:7:3
```

## Comment le pont fonctionne

`@rgaa-source/angular` réécrit les templates avant le build pour poser sur chaque
élément rendu l'attribut `data-a11y-src="fichier:ligne:colonne"`, aux offsets
que le compilateur Angular a lui-même rapportés (`parseTemplate` → `sourceSpan`).
La réécriture est une pure insertion de texte : l'AST n'est jamais re-sérialisé,
donc le formatage, les bindings et la syntaxe de contrôle de flux survivent
intacts.

À l'exécution, une violation lit sa localisation sur le nœud fautif. **Le
résultat est exact ou absent, jamais deviné** — un développeur envoyé à la
mauvaise ligne perd plus de temps qu'un développeur envoyé nulle part.

C'est l'équivalent Angular de `babel-plugin-transform-react-jsx-source`
(`_debugSource`) côté React, qui n'existait pas jusqu'ici.

## Paquets

| Paquet | Rôle |
|---|---|
| `@rgaa-source/core` | Types, interface de règle, moteur axe-core, mapping WCAG ↔ RGAA, scoring. TypeScript pur, sans dépendance framework : le même moteur tourne en CLI, sous Playwright, dans une extension. |
| `@rgaa-source/angular` | Le pont. Analyse et réécriture des templates Angular, cycle de vie de l'instrumentation. |
| `@rgaa-source/report` | Rapport HTML autonome, grille d'évaluation RGAA, comparaison à une référence. |
| `@rgaa-source/fix` | Correctifs appliqués aux positions sources, classés par le jugement qu'ils exigent. |
| `@rgaa-source/cli` | Les commandes `rgaa-source check` et `rgaa-source criteria` : Playwright, orchestration du build, rapports. |

## Utilisation

```bash
rgaa-source check --project ./mon-app          # instrumente, compile, sert et analyse
rgaa-source check https://example.com          # analyse une page déjà servie
rgaa-source criteria                           # ce que le moteur peut couvrir du RGAA
```

Sur un projet, chaque violation sort avec son fichier, sa ligne et les critères
RGAA concernés :

![Résumé d'une analyse : score de pré-audit, répartition par gravité, nombre de
critères RGAA examinés, en échec et à vérifier, et surtout le nombre de critères
hors de portée de tout contrôle automatique.](https://raw.githubusercontent.com/oussamaLaribi/RGAA/main/docs/couverture.svg)

Options principales : `--route` (répétable), `--min-score`, `--json`, `--html`,
`--grid`, `--baseline`, `--browser`, `--reuse-build`, `--force`, `--verbose`,
`--violations-only` (plus rapide, mais désactive le score), `--app` (quelle
application, dans un espace de travail qui en déclare plusieurs), `--config`,
`--no-config`. `rgaa-source --help` les liste toutes.

### Fichier de configuration

`rgaa.config.json`, à côté du `package.json` :

```json
{
  "project": ".",
  "routes": ["/", "/contact"],
  "minScore": 80,
  "html": "rapport.html",
  "grid": "grille.csv",
  "lang": "fr"
}
```

Du JSON et non du JavaScript : un fichier de configuration qui exécute du code
est un fichier que votre CI exécute, et rien ici n'a besoin de ce pouvoir.

**Ce qui va où.** Le fichier porte ce qui appartient au *projet* — routes, seuil,
langue, livrables : ce sont des propriétés de l'application, vraies partout. Les
drapeaux portent ce qui appartient à l'*exécution* — `--browser chromium` parce
que le runner n'a pas Edge, `--dry-run` parce que vous explorez.

C'est ce partage qui garde une exécution locale et la CI identiques. Des réglages
qui ne vivent que dans un fichier de workflow divergent en silence de ce que
lancent les développeurs, et la barrière devient le « ça passait chez moi » que
personne ne sait trancher. Commité, le fichier fait apparaître un changement de
seuil en revue de code.

Un drapeau l'emporte toujours sur le fichier, et `--no-config` l'ignore
entièrement. Une clé inconnue ou une valeur du mauvais type est **signalée puis
ignorée** — une clé mal orthographiée avalée en silence est ce qui fait perdre
un après-midi. Un fichier illisible, en revanche, arrête l'exécution : c'est une
erreur que son auteur veut connaître.

**La sortie suit votre environnement.** Un poste configuré en français obtient du
français, messages d'axe-core compris, repris de sa traduction officielle ; tout
le reste obtient l'anglais. `LC_ALL`, `LC_MESSAGES` et `LANG` sont lus dans
l'ordre POSIX, puis le réglage du système lui-même — le seul signal disponible
sous Windows, où ces variables ne sont généralement pas définies.

`--lang` l'emporte sur tout. En intégration continue, aucune de ces variables
n'est habituellement posée : les exécutions tombent donc sur l'anglais, et c'est
`"lang"` dans le fichier de configuration qui fixe la langue pour l'équipe, là où
ce choix appartient au projet.

Tout est traduit dans la page avant production, donc la console, le rapport HTML,
la grille et le JSON parlent la même langue sans double traduction.

**Le code de sortie dépend du contexte.** Dans un terminal, l'analyse rapporte et
sort en 0 : un humain qui explore un projet existant lit un code 1 comme un
plantage. Hors terminal — en intégration continue — elle bloque sur ce qu'elle
trouve. `--fail` et `--no-fail` forcent l'un ou l'autre, et le rapport indique
lui-même quand une exécution aurait échoué en CI.

## Correction

```bash
rgaa-source check --project ./mon-app --fix              # écrit ce qui ne demande aucun jugement
rgaa-source check --project ./mon-app --fix-suggested    # rédige aussi ce dont vous devrez écrire les mots
rgaa-source check --project ./mon-app --fix --dry-run    # montre le diff, n'écrit rien
```

![Correctifs proposés : chacun est listé avec sa ligne et ce qu'il fait, suivi du
diff exact que la commande écrirait dans le fichier.](https://raw.githubusercontent.com/oussamaLaribi/RGAA/main/docs/correction.svg)

Le plan complet est **toujours affiché en diff avant d'écrire**. Modifier
automatiquement le code de quelqu'un n'est acceptable que s'il peut tout relire
d'abord ; un compteur « 12 corrections appliquées » n'est pas relisible.

Les correctifs sont classés par le jugement qu'ils exigent :

| Niveau | Signification | Appliqué |
|---|---|---|
| **Sûr** | Mécaniquement certain sans rien savoir du sens de la page : retirer un `tabindex` positif, réautoriser le zoom. | par `--fix` |
| **Suggéré** | La forme est connue, les mots non : `alt`, `aria-label`, titre de page, niveau de titre. Écrit un marqueur `TODO-a11y`. | par `--fix-suggested` |
| **Manuel** | Contraste, ordre de focus, pertinence sémantique. Signalé, jamais écrit. | jamais |

Cette liste des correctifs sûrs est courte, et c'est volontaire. La plupart des
corrections d'accessibilité consistent à **écrire un texte qui décrit quelque
chose**, et aucun outil ne sait ce que montre une image ni ce que fait un bouton.
Une alternative fausse est pire que l'attribut manquant : le lecteur d'écran la
croit, alors qu'une alternative absente reste détectable.

Écrire dans les sources est définitif : la commande refuse de toucher un fichier
dont la copie de travail diffère de l'index, où git ne pourrait rien rendre.
Une modification déjà indexée ne bloque pas — son contenu est récupérable.

## Livrables

```bash
rgaa-source check --project ./mon-app --html rapport.html --grid grille.csv
```

Le **rapport HTML** est autonome : aucune feuille de style externe, aucun script,
aucun appel réseau. Il doit encore s'ouvrir correctement depuis une pièce jointe
dans deux ans.

La **grille** reprend les colonnes exactes du modèle d'évaluation officiel —
Thématique, Critère, Recommandation, Statut, Dérogation, Modifications à apporter,
Commentaires — pour les 106 critères, en CSV séparé par des points-virgules et
préfixé d'un BOM, faute de quoi Excel en locale française affiche les intitulés
accentués en charabia.

**Aucune ligne n'est jamais marquée `C`.** Selon la méthode RGAA, un critère
n'est conforme que si tous ses tests passent, et un contrôle automatique n'en
couvre qu'une fraction : le seul critère 1.1 en compte huit. Déclarer un critère
conforme parce que l'unique aspect vérifiable est ressorti propre reviendrait à
affirmer ce qu'on n'a pas établi, dans le document dont c'est précisément le
rôle. Ce qui n'a pas été infirmé reste `NT`, non testé — là où le modèle officiel
le place lui-même. Sur l'application de test : **15 NC, 91 NT, zéro C**.

Ce qui fait gagner du temps à l'auditeur, ce sont les lignes NC déjà remplies
avec les emplacements sources exacts.

## Intégration continue

```bash
rgaa-source check --project . --baseline .rgaa-baseline.json
```

La première exécution enregistre la référence et passe ; les suivantes comparent
et n'échouent que sur les anomalies **nouvelles** de gravité critique ou majeure.

C'est ce qui rend l'outil adoptable sur un projet existant. Personne ne corrigera
des centaines d'anomalies avant la prochaine livraison, mais tout le monde peut
convenir de ne pas en ajouter — et un seuil qu'une équipe peut tenir est un seuil
qu'elle laisse activé. Le fichier de référence se commite avec le code : la dette
restante devient visible en revue au lieu de disparaître.

L'identité d'une anomalie repose sur la règle, le fichier et le balisage, jamais
sur le numéro de ligne : celui-ci bouge dès qu'on ajoute un import au-dessus, et
une CI qui crie au loup finit supprimée.

[`examples/github-workflow.yml`](examples/github-workflow.yml) est le workflow à
recopier.

Codes de sortie : `0` conforme au seuil, `1` violations, score insuffisant ou
régression, `2` l'analyse elle-même a échoué.


## Sécurité de l'instrumentation

Les templates sont réécrits **en place**. Avant chaque réécriture, l'original est
déposé dans `node_modules/.cache/rgaa-restore/` — déjà ignoré par git — et non
seulement gardé en mémoire. Un processus tué entre l'écriture et la restauration
est donc récupéré automatiquement au lancement suivant.

C'est ce qui permet à l'analyse de ne dépendre d'aucun garde-fou git. La variante
qui refusait de tourner sur un fichier non commité bloquait le geste le plus
naturel — corriger puis re-analyser — et un garde-fou qui se déclenche sans cesse
finit désactivé, ne protégeant plus personne. Seule l'écriture des correctifs,
qui est définitive, exige encore que git puisse rendre l'original.

## Le référentiel RGAA

La table des 106 critères est **générée depuis la source officielle DINUM**
([`DISIC/RGAA`](https://github.com/DISIC/RGAA)), jamais saisie à la main. Le
fichier généré porte l'URL source et l'empreinte SHA-256 de ce qui l'a produit,
et le générateur échoue s'il ne retrouve pas exactement 106 critères sur
13 thématiques.

Passer par WCAG seul serait inexploitable : le critère de succès 1.1.1 sous-tend
à lui seul dix-neuf critères RGAA sur sept thématiques, si bien qu'un `alt`
manquant citerait les légendes, les CAPTCHA et les transcriptions vidéo. La
correspondance est donc établie par règle, chaque entrée étant justifiée contre
l'intitulé officiel du critère. Un test vérifie qu'aucune règle ne cite un
critère absent du référentiel.

## Règles propres

Sept règles tournent aux côtés d'axe, chacune répondant à un critère RGAA qu'axe
ne teste pas — soit qu'il n'ait aucune règle équivalente, soit que la sienne
s'arrête avant ce que demande le référentiel français.

| Règle | Critère | Ce qu'elle trouve |
|---|---|---|
| `rgaa-lang-mismatch` | 8.4 | La langue déclarée ne correspond pas au contenu |
| `rgaa-placeholder-page-title` | 8.6 | Un titre de page que personne n'a jamais écrit |
| `rgaa-skip-link-missing` | 12.7 | Aucun lien d'évitement vers le contenu principal |
| `rgaa-group-without-fieldset` | 11.5, 11.6 | Champs de même nature sans regroupement ni légende |
| `rgaa-missing-autocomplete` | 11.13 | Champ d'identité sans jeton `autocomplete` |
| `rgaa-link-not-explicit` | 6.1 | Intitulé de lien qui ne dit rien hors contexte |
| `rgaa-duplicate-link-text` | 6.1 | Même intitulé pour des destinations différentes |

La plus utile est la première. `ng new` écrit `lang="en"` dans le shell, les
équipes françaises l'expédient sans y toucher, et axe ne vérifie que la validité
syntaxique du code. Un lecteur d'écran prononce alors du français avec la
phonétique anglaise, ce qui le rend inintelligible. La détection est délibérément
prudente : sous quarante mots elle se tait, et il faut que la langue reconnue
devance nettement celle déclarée pour qu'elle parle.

Les deux dernières sont des **règles de revue** : le RGAA 6.1 admet qu'un lien
soit implicite quand son contexte le rend explicite, ce qu'aucun contrôle ne peut
trancher. Elles produisent des points à vérifier, pas des échecs, et n'entrent
pas dans le score — les compter comme réussies gonflerait celui-ci en remplissant
le dénominateur de contrôles qui ne peuvent jamais échouer.

Les règles sont empaquetées puis injectées dans la page comme axe. Ajouter une
règle, c'est ajouter un fichier et une ligne dans le registre : le scanner n'est
jamais touché. Une règle qui lève une exception coûte son propre constat, jamais
l'analyse entière.

## Ce que cet outil n'est pas

Le score produit est un **score de pré-audit automatique**. Ce n'est pas un
« taux de conformité RGAA », qui est une notion réglementaire établie par audit
humain.

`rgaa-source criteria` publie la capacité réelle du moteur : **35 des 106 critères**
sont atteignables par un contrôle automatique, soit 33 %. Les 71 autres exigent
un humain, et chaque rapport le dit. Les critères cités sont ceux **concernés**
par une violation, pas un verdict rendu sur eux.

## Les 71 critères restants

Cet outil s'arrête là où commence le jugement humain : le contraste perçu, la
pertinence d'un texte alternatif, l'ordre de tabulation, la cohérence d'un
parcours. C'est la majorité du RGAA, et aucun automate ne la couvrira.

Je fais ce travail. Concrètement :

- **Audit RGAA 4.1.2 complet** sur les 106 critères, livré sous la grille
  officielle, avec la déclaration d'accessibilité qui l'accompagne.
- **Remédiation sur base Angular** — corriger, pas seulement constater, avec les
  contraintes réelles d'un code de production et de son historique.
- **Mise en conformité European Accessibility Act**, applicable depuis le
  28 juin 2025.
- **Formation d'équipe** pour que les régressions cessent d'apparaître.

Écrivez-moi via [mon profil GitHub](https://github.com/oussamaLaribi). Un premier
échange sur ce que dit votre rapport ne coûte rien.

## Contribuer

Les commandes de développement, la marche à suivre pour ajouter une règle ou un
correcteur, et les principes à respecter sont dans
[CONTRIBUTING.md](CONTRIBUTING.md).

## État du projet

Version **0.1.1**, première publication. Le pont — la localisation d'une
violation jusqu'à sa ligne de code — est vérifié à chaque intégration contre une
compilation Angular réelle, et validé sur deux projets open source.

**Testé sur Angular 15, 16, 17, 19, 21 et 22** — mêmes lignes, mêmes colonnes,
même score sur les six. L'analyse des templates s'appuie sur le compilateur
d'Angular 22, installé à côté du vôtre sans interférer avec lui : une syntaxe de
template plus récente que la v22 demanderait une mise à jour de ce paquet.

La syntaxe historique `*ngIf` / `*ngFor` est couverte aussi bien que les blocs
`@if` / `@for` : le pont travaille sur des positions dans le fichier, pas sur la
syntaxe de contrôle.

**Angular 15 est le plancher vérifié.** Angular 14 n'a pas pu être testé : il ne
compile plus dans un environnement Node actuel, ses types butant sur `Disposable`
que son TypeScript 4.7 ne connaît pas. C'est une limite d'Angular 14, pas de cet
outil.

### Limites connues

- **Angular seulement** pour l'instant. Le cœur, les correctifs et les rapports
  ne dépendent d'aucun framework : ajouter React ou Vue demande un adaptateur,
  pas une réécriture.
- **Votre projet doit compiler.** L'outil instrumente puis lance `ng build`.
- **Les localisations n'existent que sur une compilation instrumentée.** Analyser
  une URL arbitraire rapporte les violations mais ne peut les rattacher à aucun
  fichier, et le rapport le dit.
- **Les templates écrits en ligne** dans le décorateur  sont
  couverts comme ceux des fichiers  : les localisations pointent alors
  dans le .
- **Ce qui est produit à l'exécution n'est pas localisable** — un avatar venu
  d'une API, le contenu d'un composant tiers. Ces cas sont listés à part plutôt
  que rattachés à une ligne approximative.
- **Environ un tiers des 106 critères RGAA** est atteignable automatiquement.
  `rgaa-source criteria` publie exactement lesquels.
- Les **iframes d'une autre origine** échappent à l'analyse.

### Envisagé

Davantage de règles et de correctifs, un adaptateur pour un second framework, et
une extension de navigateur qui hériterait du même pont — elle afficherait le
fichier et la ligne là où les extensions existantes montrent un sélecteur CSS.

Les retours sur de vrais projets sont ce qui manque le plus :
[ouvrez une issue](https://github.com/oussamaLaribi/RGAA/issues), surtout si une
localisation tombe à côté.
