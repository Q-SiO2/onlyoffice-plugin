# Guide du présentateur — pour un coéquipier

## Avant le cours

1. Demandez au responsable technique de démarrer le serveur, importer la vraie liste et distribuer les codes individuels.
2. Ouvrez votre présentation dans ONLYOFFICE Desktop Editors.
3. Ouvrez le site `/presenter` et entrez la clé présentateur. Ne projetez pas la clé : elle reste sur le site.
4. Sur le site, cliquez **Démarrer une session** puis activez votre première scène. En démo, une session est déjà créée.
5. Dans **Plugins → Palo Alto Live**, collez le lien public de la présentation ou l’adresse du site et cliquez **Charger les graphiques**. Aucune clé n’est demandée ici.
6. Sélectionnez votre diapositive et ajoutez le QR, le sondage ou le nuage de mots depuis le plugin. Faites glisser et redimensionnez le graphique sélectionné avec les poignées de l’éditeur. Pour préparer les autres scènes, activez-les sur le site puis ajoutez leurs graphiques aux diapositives correspondantes.
7. Testez le QR avec un vrai téléphone. Si l’adresse contient `localhost`, demandez au responsable de corriger l’adresse publique avant le cours.
8. Attendez les étudiants. Le compteur indique les appareils actuellement connectés, pas une liste de numéros.

Le mode démo porte une bannière explicite et ne convient pas à la vraie liste. Ne partagez pas le fichier contenant tous les codes.

## Pour chaque scène

1. Sélectionnez la scène souhaitée. **Démarrer la scène** place les téléphones en mode observation.
2. Lancez manuellement votre vidéo/animation dans la présentation. Le plugin ne détecte pas sa fin automatiquement.
3. Cliquez **Ouvrir le vote** quand la scène est terminée. Les questions apparaissent sur les téléphones.
4. Surveillez le compteur de réponses. Un étudiant ayant déjà répondu ne peut pas recommencer sans réinitialisation.
5. Cliquez **Fermer le vote**. Les nouveaux votes ne sont plus acceptés.
6. Sur le site, cliquez **Afficher les résultats**. Le plugin actualise les graphiques liés à cette scène sans changer leur position ou leurs dimensions. Vous pouvez aussi ouvrir l’écran de projection du site. Seuls les résultats agrégés sont affichés.
7. Gardez le plugin ouvert et connecté, avec les graphiques non groupés et leurs noms d’objet inchangés. Les autres scènes gardent leur dernière image jusqu’à leur activation. Les PNG téléchargés depuis le site et les images de l’ancien plugin sont des instantanés : recréez une fois les anciens graphiques avec **Ajouter** pour les lier.
8. Cliquez **Expliquer l’axiome** et faites votre commentaire.
9. Cliquez **Retour attente**, puis **Scène suivante**. Les étudiants restent sur la même page.

Le vote doit être fermé avant de changer de scène. **Masquer les résultats** retire l’affichage public, pas les réponses enregistrées. Réouvrir un vote permet aux non-répondants de participer; les votes déjà enregistrés restent uniques. **Réinitialiser les réponses** efface les réponses de la scène actuelle et demande confirmation. Utilisez-le seulement si toute la classe doit voter à nouveau.

## Pendant un diaporama plein écran

Le plugin sert à composer vos diapositives en mode édition. Toutes les commandes de séance/vote sont sur `/presenter`, qu’un coéquipier peut piloter pendant le diaporama. Répétez l’actualisation native pendant le plein écran avant le cours ; utilisez `/display` comme écran de projection si nécessaire. L’état est partagé ; deux commandes simultanées peuvent demander de réessayer. Le présentateur lance et arrête les vidéos dans ONLYOFFICE.

## Après la présentation

1. Cliquez **Terminer la session** puis confirmez. Les étudiants voient le message de fin.
2. Cliquez **Exporter les résultats CSV** si vous souhaitez garder les totaux. Ce fichier ne contient pas de numéros ni d’identifiants individuels.
3. Si vous souhaitez effacer immédiatement les réponses, cliquez **Effacer cette session** après l’export et confirmez.
4. Déconnectez-vous du tableau de bord. Fermez la présentation selon votre procédure habituelle.

Le responsable peut ensuite appliquer la durée de conservation, supprimer les codes temporaires et arrêter le serveur. Une nouvelle présentation nécessite une nouvelle session et une authentification, mais chaque étudiant ne se connecte qu’une fois au cours de cette session.

## Si quelque chose ne fonctionne pas

En cas de voyant **Connexion perdue**, attendez la reconnexion et vérifiez avec le responsable le Wi-Fi et le serveur. Les boutons de contrôle sont bloqués tant que le lien direct n’est pas revenu. N’appuyez pas plusieurs fois sur un bouton d’insertion si sa confirmation est incertaine : regardez d’abord la diapositive. Utilisez le tableau de bord navigateur si ONLYOFFICE pose problème. Les solutions détaillées sont dans [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
