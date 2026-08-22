# @rgaa-source/core

Moteur d'accessibilité : orchestration d'axe-core, règles propres, correspondance
WCAG ↔ RGAA 4.1.2, calcul du score.

TypeScript pur, sans dépendance framework et sans API Node : le même moteur
tourne sous Playwright, dans un content script d'extension et dans un test
unitaire.

## Ce qu'il apporte

- **Correspondance RGAA établie par règle.** Passer par WCAG seul est
  inexploitable : le critère 1.1.1 sous-tend à lui seul dix-neuf critères RGAA
  sur sept thématiques. La table des 106 critères est générée depuis la source
  officielle DINUM, avec l'empreinte SHA-256 de ce qui l'a produite.
- **Sept règles propres** répondant à des critères qu'axe ne teste pas :
  langue déclarée incohérente avec le contenu (8.4), titre de page jamais écrit
  (8.6), lien d'évitement absent (12.7), champs non regroupés (11.5/11.6),
  `autocomplete` manquant (11.13), intitulés de liens non explicites (6.1).
- **Couverture affichée sur chaque résultat** : combien de critères ont été
  examinés, et surtout combien ne l'ont pas été.

## Ajouter une règle

Implémentez `AccessibilityRule`, ajoutez une ligne au registre. Le scanner n'est
jamais touché.

```ts
export const maRegle: AccessibilityRule = {
  id: 'rgaa-ma-regle',
  severity: 'moderate',
  wcag: ['1.3.1'],
  rgaa: ['9.3'],
  message: '…',
  help: '…',
  recommendation: '…',
  run({ document }) {
    const candidats = [...document.querySelectorAll('…')];
    return { candidates: candidats.length, findings: [] };
  },
};
```

`candidates` est le dénominateur du score : une règle qui n'a rien examiné ne
pénalise ni ne récompense la page. Une règle marquée `review: true` produit des
points à vérifier plutôt que des échecs, et n'entre pas dans le score.

Documentation complète : [README du projet](../../README.md).
