### Effacement sécurisé NVMe natif

Les disques NVMe prennent en charge l'effacement sécurisé au niveau matériel, s'exécutant directement sur le contrôleur du disque. Ces méthodes sont beaucoup plus rapides que les méthodes d'écrasement de blocs standard.

#### Options d'effacement sécurisé

:::accordion Formatage des données utilisateur (SES=1)
Déclenche le contrôleur SSD NVMe interne pour écraser physiquement tous les blocs de données utilisateur sur la mémoire flash. Il s'agit d'une action d'écriture destructive qui efface toutes les cellules NAND, prenant généralement 1 à 2 minutes selon la capacité du disque.
:::

:::accordion Formatage cryptographique (SES=2)
Indique au contrôleur SSD d'effacer la clé cryptographique utilisée pour chiffrer les blocs utilisateur et de générer une nouvelle clé. Comme la clé est écrasée, toutes les données existantes deviennent instantanément irrécupérables. Se termine en quelques secondes.
:::

:::accordion Compatibilité du contrôleur et repli
Tous les contrôleurs NVMe ne prennent pas en charge le formatage cryptographique (SES=2) ni même le formatage des données utilisateur (SES=1). Si un effacement sécurisé n'est pas pris en charge par votre contrôleur matériel, le backend renverra un avertissement, et vous devrez utiliser l'effacement standard par écrasement de blocs (DoD/Zéros) dans l'onglet Broyage de disque.
:::

> [!IMPORTANT]
> Pour exécuter des actions de formatage dans des conteneurs Docker, le système monte le contrôleur NVMe principal (par ex. `/dev/nvme0`) ainsi que le chemin de l'espace de noms (par ex. `/dev/nvme0n1`) afin de transmettre les séquences de commandes `ioctl` appropriées.
