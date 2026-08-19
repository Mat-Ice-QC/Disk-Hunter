### Tests de performance de vitesse de disque basés sur fio

Disk Hunter exécute des tests de vitesse d'E/S haute performance à l'aide de `fio` (Flexible I/O Tester). Il évalue les performances séquentielles pour profiler les taux de transfert.

#### Options de type de test de vitesse

:::accordion Lecture uniquement
Mesure le débit de lecture séquentielle de la partition sélectionnée. Il s'agit d'une opération de lecture sûre qui ne modifie pas les fichiers de la partition.
:::

:::accordion Écriture uniquement
Mesure le débit d'écriture séquentielle. Génère un fichier temporaire de test (`.fio_test`) à l'intérieur du système de fichiers monté. Ce fichier est automatiquement nettoyé à la fin du test.
:::

:::accordion Lecture et Écriture
Exécute des actions simultanées de lecture et d'écriture pour dresser le profil des capacités bidirectionnelles de l'appareil.
:::

#### Options de taille de bloc de test

:::accordion Taille de bloc de 1 Go
Une taille de bloc de test légère et rapide. Idéal pour un contrôle rapide des performances des disques durs standard et des supports flash.
:::

:::accordion Taille de bloc de 10 Go
Une taille de bloc de test intensive. Contourne les limites du cache interne du contrôleur pour mesurer le débit de lecture et d'écriture soutenu sur une plus longue période.
:::

:::accordion Taille de bloc de 100 Go
Une taille de bloc de test exhaustive et de niveau entreprise. Recommandé pour les disques SSD hautes performances afin de mesurer le débit soutenu sous une charge d'E/S intensive et prolongée. Requiert une partition d'au moins 101 Go.
:::

:::accordion Tous (1 Go, 10 Go, 100 Go)
Exécute une suite séquentielle testant toutes les tailles de blocs l'une après l'autre. Le système ignore automatiquement les tailles de blocs trop grandes si la partition cible ne respecte pas les critères d'espace minimum requis (11 Go pour 10 Go, 101 Go pour 100 Go).
:::

> [!IMPORTANT]
> Les fichiers de test de performance de vitesse sont alloués de manière dynamique dans le point de montage de la partition du disque cible, empêchant les écritures directes sur les blocs bruts qui détruiraient la structure de la partition.
