# @rgaa-source/report

Livrables d'un pré-audit : rapport HTML, grille d'évaluation RGAA, comparaison à
une référence.

## Grille RGAA 4.1

Reprend les colonnes exactes du modèle officiel — Thématique, Critère,
Recommandation, Statut, Dérogation, Modifications à apporter, Commentaires —
pour les 106 critères.

**Aucune ligne n'est jamais marquée `C`.** Selon la méthode RGAA un critère n'est
conforme que si tous ses tests passent, et un contrôle automatique n'en couvre
qu'une fraction : le seul critère 1.1 en compte huit. Ce qui n'a pas été infirmé
reste `NT`, non testé, là où le modèle officiel le place lui-même. Les lignes
`NC` arrivent pré-remplies avec les emplacements sources exacts.

## Comparaison à une référence

Transforme la question « ce code est-il propre ? » en « ce changement l'a-t-il
dégradé ? ». L'identité d'une anomalie repose sur la règle, le fichier et le
balisage, jamais sur le numéro de ligne — celui-ci bouge dès qu'on ajoute un
import au-dessus, et une CI qui crie au loup finit supprimée.

## Rapport HTML

Autonome : aucune feuille externe, aucun script, aucun appel réseau. Il doit
encore s'ouvrir correctement depuis une pièce jointe dans deux ans.

Documentation complète : [README du projet](../../README.md).
