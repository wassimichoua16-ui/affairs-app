# Application Affair's

Application mobile (Android / iPhone) : informations, magasins, catalogue vers affairs.fr et estimation de reprise par IA.

- `src/` : écrans et logique de l'application
- `serveur/` : serveur d'estimation IA + espace gérant
- `.github/workflows/apk.yml` : fabrique automatiquement l'APK Android de test (onglet **Actions** › **Artifacts**)
- Guides : `APK-DE-TEST.txt`, `GUIDE-PUBLICATION.txt`, `FICHE-STORES.txt`

## Affairs Dirigeants (application privée)

Dossier `dirigeants/` : application réservée à la direction.
- Estimations clients en temps réel (numéro, magasin choisi, client, photo, calcul interne), actualisées toutes les 15 s avec notification.
- Suivi : statut (achetée, refusée…), prix payé, note interne.
- Statistiques par magasin, estimation interne par IA (prix de revente, marge, risque), réglage des marges.
- Connexion par le mot de passe gérant du serveur. Sans serveur configuré : mode démo avec estimations simulées.
- APK fabriquée par `.github/workflows/apk-dirigeants.yml` (release « dirigeants »).
