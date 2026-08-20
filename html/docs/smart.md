### S.M.A.R.T. Health Testing

Self-Monitoring, Analysis, and Reporting Technology provides active warnings for drive failure indicators. Use this tab to verify device integrity.

#### S.M.A.R.T. Diagnostic Options

:::accordion Short Self-Test (2 minutes)
A quick hardware sanity check. Evaluates primary electrical components, head positioning mechanisms, and read/write buffering. Runs as a non-destructive background process.
:::

:::accordion Extended (Long) Self-Test (Hours)
An in-depth integrity scan that performs a complete block surface sweep to detect read errors, weak sectors, and bad sectors. Recommended for onboarding new or suspect drives. Non-destructive.
:::

:::accordion Raw Attribute Logs
Clicking on details loads the full raw S.M.A.R.T. attributes table. Technicians can read individual attributes (such as Reallocated Sector Count, Power-On Hours, and Wear Range Delta) to assess drive lifespans.
:::

:::accordion S.M.A.R.T. Action History
The sub-menu logs records of previous tests, capturing execution timestamps, drive serial numbers, selected test modes, and pass/fail reports.
:::

> [!NOTE]
> To prevent unnecessary disk activity, S.M.A.R.T attributes are cached for 30 seconds globally. The Disk Overview page receives SMART health status (Passed/Failing/N/A) via the WebSocket broadcast every 30 seconds, eliminating the need for per-disk HTTP requests on every refresh. Manual page refreshes will not trigger physical drive queries unless the cache window expires.
