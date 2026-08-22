# @rgaa-source/fix

Applique des correctifs d'accessibilité **dans le code source**, aux positions
que le pont a relevées.

Les correctifs sont classés par le jugement qu'ils exigent :

| Niveau | Signification |
|---|---|
| **safe** | Mécaniquement certain sans rien savoir du sens de la page |
| **suggested** | La forme est connue, les mots non — écrit un marqueur `TODO-a11y` |
| **manual** | Signalé, jamais écrit |

La liste des correctifs sûrs est courte, et c'est volontaire. La plupart des
corrections d'accessibilité consistent à **écrire un texte qui décrit quelque
chose**, et aucun outil ne sait ce que montre une image ni ce que fait un bouton.
Une alternative fausse est pire que l'attribut manquant : le lecteur d'écran la
croit, alors qu'une absence reste détectable.

Le plan est toujours produit en entier avant la moindre écriture, pour être
affiché en diff et refusé. Les éditions qui se chevauchent sont rejetées plutôt
qu'appliquées au hasard.

Documentation complète : [README du projet](../../README.md).
