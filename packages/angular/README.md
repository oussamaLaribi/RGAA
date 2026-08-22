# @rgaa-source/angular

Le pont entre le DOM rendu et le code source Angular.

Réécrit les templates avant la compilation pour poser sur chaque élément rendu
l'attribut `data-a11y-src="fichier:ligne:colonne"`, aux offsets que le
compilateur Angular rapporte lui-même (`parseTemplate` → `sourceSpan`).

C'est l'équivalent Angular de `babel-plugin-transform-react-jsx-source`
(`_debugSource`) côté React, qui n'existait pas jusqu'ici.

## Propriétés

- **Pure insertion de texte.** L'AST n'est jamais re-sérialisé : formatage,
  bindings, `@if`/`@for`/`@switch`/`@defer` survivent intacts.
- **Exact ou absent, jamais deviné.** Un développeur envoyé à la mauvaise ligne
  perd plus de temps qu'un développeur envoyé nulle part.
- **Idempotent**, donc une reprise après échec est sans danger.
- **Récupérable.** Avant chaque réécriture l'original est déposé dans
  `node_modules/.cache/rgaa-restore/` ; un processus tué entre l'écriture et la
  restauration est récupéré au lancement suivant.

## Usage

```ts
const session = await instrumentTemplates(templates, projectRoot);
try {
  // compiler le projet : la sortie conserve les localisations
} finally {
  await session.restore(); // toujours dans un finally
}
```

Documentation complète : [README du projet](../../README.md).
