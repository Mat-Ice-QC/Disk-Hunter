### Aperçu de l'architecture du système

Disk Hunter est structuré pour isoler les utilitaires de disque de niveau root, privilégiés et potentiellement destructeurs, de l'API web principale. En conteneurisant chaque tâche, le serveur central reste stable et sécurisé.

> [!NOTE]
> Les conteneurs PRIVILÉGIÉS s'exécutent avec un accès direct aux chemins matériels des disques, permettant à des commandes comme `smartctl`, `nwipe` et `nvme-cli` d'interagir directement avec les registres du contrôleur sans exposer le processus backend principal à des écritures brutes sur le périphérique.

#### Flux de travail principal du technicien

- [x] **Connecter le disque cible :** Vérifier l'alignement dans l'Aperçu du disque.
- [x] **Évaluer la santé SMART :** S'assurer que le disque est physiquement sain avant le test de performance ou le partitionnement.
- [x] **Désinfecter :** Exécuter un effacement sécurisé à l'aide des algorithmes nvme format ou nwipe selon le type de support.
- [x] **Exporter :** Télécharger le certificat d'effacement PDF visuel pour les pistes d'audit.

#### Contrôles de sécurité et paramètres système

:::accordion Protéger le disque système (Root)
L'activation de ce paramètre dans les Paramètres empêche le disque principal contenant le système d'exploitation d'apparaître dans l'Éditeur de partitions, les diagnostics S.M.A.R.T. et les onglets de Broyage de disque. Ce contrôle de sécurité protège l'OS hôte contre tout effacement accidentel.
:::

:::accordion Effacement de l'historique opérationnel
Les techniciens peuvent effacer les journaux d'historique des actions (historique de broyage, rapports S.M.A.R.T., enregistrements speedtest ou fichiers ISO téléchargés) directement depuis le panneau des Paramètres pour libérer de l'espace de stockage local et maintenir la propreté opérationnelle.
:::

#### Fonctionnalités d'interface et d'utilisation

:::accordion Bascule de disposition de l'Aperçu des disques
La page Aperçu des disques prend en charge deux modes de disposition : **Carrés** (grille de cartes compacte) et **Liste** (lignes pleine largeur). Cliquez sur le bouton de bascule dans l'en-tête pour passer de l'un à l'autre. Votre préférence est enregistrée entre les sessions.
:::

:::accordion Visionneuse d'images de disque
Sur la page Aperçu des disques, cliquez sur n'importe quelle image de disque pour ouvrir une vue en plein écran. L'image s'affiche dans sa résolution native complète. Cliquez en dehors de l'image ou sur le bouton de fermeture pour la masquer.
:::

:::accordion Barre de sélection groupée des disques
Les pages Broyage de disque, Tests S.M.A.R.T. et Test de vitesse incluent une barre de sélection au-dessus de la liste des disques avec trois contrôles : **Tout sélectionner** coche toutes les cases des disques visibles (non filtrés) à la fois, **Tout désélectionner** décoche toutes les cases, et **Filtre** permet de saisir un mot-clé (par ex. `860`, `samsung`, `sd`) pour n'afficher que les disques correspondants. « Tout sélectionner » ne s'applique alors qu'aux disques filtrés, permettant une sélection groupée rapide de modèles de disques spécifiques.
:::

:::accordion Terminal de débogage API
Un terminal de diagnostic flottant est disponible sur chaque page lorsqu'il est activé dans les Paramètres. Il intercepte et journalise tous les appels d'API fetch (méthode, URL, statut de réponse) et les événements WebSocket (connexion/déconnexion/erreur) en temps réel. Utilisez-le pour résoudre les problèmes de connectivité API ou surveiller les interactions backend.
:::

#### Éditeur de partitions

:::accordion Aperçu de l'éditeur de partitions
L'éditeur de partitions fournit une interface visuelle pour créer, supprimer et formater des partitions sur des disques physiques. Les cartes de disque s'affichent dans une grille responsive avec le modèle, le chemin, la taille, le type de table de partitions et une barre d'allocation. Cliquez sur n'importe quelle carte pour ouvrir le modal de partitionnement.
:::

:::accordion Effacement groupé
Le panneau Opérations groupées en haut de la page permet d'effacer plusieurs disques à la fois. Sélectionnez les disques via les cases à cocher (utilisez Tout sélectionner / Tout désélectionner / Filtre pour une sélection rapide), choisissez un type de table de partitions (GPT ou MSDOS), puis cliquez sur « Wipe Selected Drives ». Une boîte de dialogue de confirmation liste tous les disques cibles avant de procéder. Cela détruit toutes les partitions et données existantes sur chaque disque sélectionné.
:::

:::accordion Modal de partitionnement
Le modal affiche les tuiles d'information du disque (modèle, taille, type de table, taille de secteur), un graphique visuel de partition avec des blocs colorés représentant chaque partition et l'espace libre, une barre d'actions avec six opérations (Nouvelle table, Créer, Formater, Supprimer, Nommer, Gérer les drapeaux), et un tableau de partitions avec les colonnes : numéro, système de fichiers, nom/étiquette, début, fin, taille et drapeaux. Cliquez sur un bloc de partition dans le graphique ou sur une ligne du tableau pour le sélectionner — les deux se synchronisent. Sélectionner de l'espace libre active la création de partition ; sélectionner une partition existante active le formatage, la suppression, le nommage et la gestion des drapeaux.
:::
