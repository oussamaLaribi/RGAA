# @rgaa-source/cli

Analyse d'accessibilité pour projets **Angular** qui rapporte **la ligne de code**,
pas un sélecteur CSS.

```bash
npx @rgaa-source/cli check --project ./mon-app
```

```
  src/app/checkout/checkout.component.html
    42:8      critical image-alt      Images must have alternative text
              <img src="product.jpg">
              WCAG 1.1.1  ·  RGAA 1.1, 1.2
```

Les outils existants s'arrêtent à `body > main > form > input.email`, qui ne
correspond à aucun fichier ouvrable. Ici, la violation porte sa propre adresse
source, parce que les templates ont été instrumentés avant la compilation.

## Commandes

| | |
|---|---|
| `check --project <dir>` | instrumente, compile, sert et analyse un projet Angular |
| `check <url…>` | analyse des pages déjà servies (sans localisation source) |
| `criteria` | ce que le moteur peut couvrir des 106 critères RGAA |

## Options

`--route <path>` (répétable) · `--min-score <n>` · `--baseline <file>` ·
`--html <file>` · `--grid <file>` · `--json <file>` · `--fix` ·
`--fix-suggested` · `--dry-run` · `--browser <channel>` · `--no-fail` ·
`--reuse-build` · `--force` · `--verbose`

Codes de sortie : `0` conforme au seuil · `1` violations, score insuffisant ou
régression · `2` l'analyse elle-même a échoué.

## Prérequis

Node 20+ et un navigateur pour Playwright. Par défaut le CLI pilote l'Edge déjà
présent sous Windows ; ailleurs, `npx playwright install chromium` puis
`--browser chromium`.

## Portée

Le score produit est un **pré-audit automatique**, pas un taux de conformité
RGAA — cette notion est réglementaire et s'établit par un audit humain. Environ
un tiers des 106 critères est atteignable automatiquement ; `rgaa criteria` le
détaille.

Documentation complète : [README du projet](../../README.md).
