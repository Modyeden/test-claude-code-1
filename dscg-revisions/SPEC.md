# Suivi des révisions DSCG — Spécification v1

## Objectif
Suivre l'avancement des révisions des UE1, UE4 et UE5 du DSCG, chapitre par chapitre,
avec révision espacée, suivi des annales et compte à rebours des épreuves.

## Contraintes
- Site statique (HTML, CSS, JavaScript, sans framework ni serveur).
- Données stockées localement dans le navigateur (`localStorage`), sans compte.
- Sauvegarde et restauration par export/import d'un fichier JSON.
- Responsive : utilisable sur iPhone et sur ordinateur, installable sur l'écran d'accueil
  (manifest web). Portage iOS possible plus tard avec Capacitor.
- Thème clair et sombre automatiques.

## UE couvertes
- **UE1** Gestion juridique, fiscale et sociale
- **UE4** Comptabilité et audit
- **UE5** Management des systèmes d'information

Chaque UE est préremplie avec les grands thèmes du programme. La liste est modifiable :
ajouter, renommer, supprimer des chapitres.

## Fonctionnalités

### 1. Suivi par chapitre
Chaque chapitre a un statut : **Non vu**, **En cours**, **Acquis**, **À revoir**.
La progression d'une UE est la part de chapitres « Acquis ».

Un chapitre peut être découpé en **sous-chapitres** (un seul niveau). Il devient alors
un regroupement repliable : son statut et ses révisions passent à ses sous-chapitres,
qui comptent chacun dans la progression. Les actions d'édition (ajouter, renommer,
supprimer) apparaissent via le bouton « Modifier ».

### 2. Révision espacée
- Passer un chapitre en « Acquis » programme une première révision à J+1.
- Lors d'une révision : « Je maîtrise » passe à l'intervalle suivant
  (1, 3, 7, 14, 30 jours, puis 30 jours) ; « À retravailler » remet le chapitre
  en « À revoir » et reprogramme à J+1.
- Le tableau de bord liste les révisions dues aujourd'hui ou en retard.

### 3. Annales et examens blancs
- Saisie : UE, date, intitulé (ex. « Annale 2024 »), note sur 20.
- Liste triée par date, suppression possible.
- Moyenne et courbe d'évolution des notes par UE.

### 4. Compte à rebours et planning
- Date d'épreuve modifiable pour chaque UE ; affichage des jours restants.
- Planning hebdomadaire : pour chaque jour (lundi à dimanche), une liste de
  chapitres à travailler, choisis parmi ceux des UE.

### 5. Réglages
- Dates d'épreuves.
- Export et import JSON ; réinitialisation complète (avec confirmation).

## Écrans
1. **Tableau de bord** : comptes à rebours, progression par UE, révisions du jour.
2. **UE** : un onglet par UE, liste des chapitres avec statut et prochaine révision.
3. **Annales** : formulaire, liste, moyennes et courbes.
4. **Planning** : semaine type.
5. **Réglages**.

## Hors périmètre v1
Comptes et synchronisation, chronométrage du temps passé, minuteur Pomodoro,
notifications push, fiches de cours.
