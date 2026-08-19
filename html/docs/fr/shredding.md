### Normes de broyage de disque

Pour les disques durs et SSD SATA/SAS, Disk Hunter invoque `nwipe` dans des conteneurs isolés. Choisissez l'algorithme qui répond aux critères de conformité de votre organisation :

| Norme d'effacement | Passes | Description |
|---|---|---|
| **Remplir de zéros** | 1 | Méthode la plus rapide. Écrit des 0x00 à toutes les adresses. Idéal pour les disques non confidentiels. |
| **DoD Court** | 3 | Conforme à DoD 5220.22-M Court. Écrit des zéros, des uns, puis des octets aléatoires avec vérification. |
| **DoD Complet** | 7 | Conforme à DoD 5220.22-M Complet. Répète les cycles DoD Court avec des passes complémentaires. |
| **Gutmann** | 35 | Méthode de désinfection extrême conçue pour éliminer l'historique des signatures magnétiques sur les anciens disques durs. |

#### Options d'algorithme d'effacement

:::accordion Remplir de zéros (1 Passe)
Écrit `0x00` séquentiellement sur tous les secteurs d'adresse du disque. Idéal pour le nettoyage de données non sensibles ou pour préparer un disque à des réinstallations standards. Temps d'exécution le plus rapide.
:::

:::accordion DoD Court 5220.22-M (3 Passes)
Une norme de désinfection en three phases. Écrit des zéros, des uns, puis un flux de caractères pseudo-aléatoires, avec vérification des passes pour garantir la réussite de l'écriture. Fortement recommandé pour la réutilisation commerciale.
:::

:::accordion DoD Complet 5220.22-M (7 Passes)
Un cycle d'écriture exhaustif en sept passes. Alterne à plusieurs reprises des modèles de caractères et des valeurs complémentaires, en se terminant par une passe aléatoire. Utilisé pour les critères de conformité de haute sécurité.
:::

:::accordion Gutmann (35 Passes)
La séquence classique de désinfection Gutmann. Écrit 35 passes distinctes en utilisant des modèles d'encodage magnétique spécifiques et pseudo-aléatoires. Conçu pour les anciens disques durs (HDD) à plateaux magnétiques.
:::

:::accordion Flux PRNG (Passe Aléatoire)
Une norme de désinfection en une seule passe qui remplit chaque secteur d'adresse avec un flux continu d'octets aléatoires. Plus rapide que les algorithmes multi-passes mais très efficace pour empêcher la récupération simple.
:::

#### Paramètres de vérification

:::accordion Sans vérification
Ignore la lecture des secteurs du disque après l'écriture. Maximise le débit de désinfection et réduit les temps d'exécution d'environ la moitié.
:::

:::accordion Vérifier uniquement la dernière passe
Lit et valide tous les secteurs du disque après le balayage final. Offre un excellent compromis entre la vérification de sécurité et la haute performance.
:::

:::accordion Vérifier toutes les passes
Valide l'état des secteurs après chaque passe d'écriture. Garantit une sécurité extrême et l'intégrité des blocs, mais augmente considérablement le temps d'exécution global.
:::

> [!WARNING]
> Une fois que le broyage du disque commence, toutes les tables de partitionnement, les secteurs de démarrage et les blocs de données sont supprimés instantanément. Assurez-vous de vérifier le numéro de série de l'appareil avant l'exécution.
