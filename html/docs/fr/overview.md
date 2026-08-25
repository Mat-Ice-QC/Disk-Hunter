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
