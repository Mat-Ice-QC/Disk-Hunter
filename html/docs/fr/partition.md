### Éditeur de partitions et systèmes de fichiers

Permet de partitionner les périphériques de bloc à l'aide de tables MBR ou GPT, de créer des volumes et de formater avec des systèmes de fichiers standards.

| Système de fichiers | Compatibilité | Cas d'utilisation |
|---|---|---|
| **ext4** | Natif Linux | Système de fichiers Linux standard avec journalisation. Optimisé pour les serveurs de stockage. |
| **NTFS** | Natif Windows, Lecture/Écriture Linux | Système de fichiers principal pour les installations Windows modernes. Convient aux disques externes. |
| **FAT32** | Compatibilité universelle | Norme universelle pour les clés USB. Limité à une taille de fichier maximale de 4 Go. |

#### Type de table de partition (Label)

:::accordion GPT (GUID Partition Table)
La norme moderne. Requis pour les disques de plus de 2 To, prend en charge le démarrage UEFI et permet jusqu'à 128 partitions primaires.
:::

:::accordion MSDOS (Master Boot Record / MBR)
Le format hérité de table de partition. Limité à un maximum de 4 partitions primaires et à des capacités de disque de 2 To. Compatible avec le démarrage BIOS historique.
:::

:::accordion Autres architectures (AIX, BSD, Mac, Loop, Sun)
Styles de labels spécifiques pour les systèmes cibles non standard (par exemple, les systèmes AIX, les slices BSD, les architectures Apple HFS, les hôtes Sun SPARC ou le mappage de fichier de boucle unique).
:::

#### Formats de système de fichiers

:::accordion ext4 / ext3 / ext2
La famille de systèmes de fichiers par défaut pour Linux. ext4 est robuste avec des fonctions de journalisation. ext2 n'a pas de journalisation, ce qui réduit l'usure sur les clés USB/SSD.
:::

:::accordion ntfs
Microsoft Windows NTFS. Prend en charge les fichiers de plus de 4 Go, la compression et le mappage des autorisations. Entièrement opérationnel en lecture/écriture sous Linux.
:::

:::accordion fat32 / fat16
Systèmes de fichiers DOS FAT classiques. Compatibles globalement en lecture/écriture sous Windows, macOS, Linux et les micrologiciels embarqués. Notez que FAT32 restreint la taille d'un fichier à un maximum de 4 Go.
:::

:::accordion btrfs / xfs
Systèmes de fichiers de nouvelle génération. btrfs offre des instantanés (snapshots) avancés par copie sur écriture et des sous-volumes. xfs excelle dans les opérations d'E/S parallèles hautes performances.
:::
