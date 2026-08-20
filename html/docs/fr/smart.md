### Diagnostics de santé S.M.A.R.T.

La technologie S.M.A.R.T. (Self-Monitoring, Analysis, and Reporting Technology) fournit des avertissements actifs pour les indicateurs de défaillance de disque. Utilisez cet onglet pour vérifier l'intégrité de l'appareil.

#### Options de diagnostic S.M.A.R.T.

:::accordion Test automatique court (2 minutes)
Un test rapide de santé du matériel. Évalue les principaux composants électriques, les mécanismes de positionnement de la tête et la mise en mémoire tampon de lecture/écriture. S'exécute en arrière-plan et est non destructif.
:::

:::accordion Test automatique étendu (Heures)
Un balayage complet de l'intégrité de la surface des blocs pour détecter les erreurs de lecture, les secteurs faibles et les secteurs défectueux. Recommandé pour tester les nouveaux disques ou suspects. Non destructif.
:::

:::accordion Journaux d'attributs bruts
Un clic sur les détails charge le tableau complet des attributs S.M.A.R.T. bruts. Les techniciens peuvent lire les attributs individuels (tels que le nombre de secteurs réalloués, les heures de fonctionnement et le taux d'usure) pour évaluer la durée de vie du disque.
:::

:::accordion Historique des actions S.M.A.R.T.
Le sous-menu enregistre les rapports des tests précédents, capturant les horodatages d'exécution, les numéros de série du disque, les modes de test sélectionnés et les statuts réussite/échec.
:::

> [!NOTE]
> Pour éviter toute activité disque inutile, les attributs S.M.A.R.T sont mis en cache pendant 30 secondes au niveau global. La page Aperçu des disques reçoit le statut de santé S.M.A.R.T (Réussi/Défaillant/N/D) via la diffusion WebSocket toutes les 30 secondes, éliminant le besoin de requêtes HTTP individuelles par disque à chaque rafraîchissement. Les rafraîchissements manuels de la page ne déclencheront pas de requêtes physiques au disque à moins que la fenêtre de cache n'ait expiré.
