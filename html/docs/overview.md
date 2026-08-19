### System Architecture Overview

Disk Hunter is structured to isolate root-level, privileged, and potentially destructive disk utilities from the main web API. By containerizing each task, the core server remains stable and secure.

> [!NOTE]
> PRIVILEGED containers run with direct access to disk hardware paths, allowing commands like `smartctl`, `nwipe`, and `nvme-cli` to interact directly with controller registers without exposing the main backend process to raw device writes.

#### Technician Core Workflow

- [x] **Connect target disk:** Verify alignment in Disk Overview.
- [x] **Assess SMART health:** Ensure the drive is physically healthy before benchmarking or partitioning.
- [x] **Sanitize:** Execute secure wipe using nvme format or nwipe algorithms depending on medium type.
- [x] **Export:** Download visual PDF Erasure Certificate for audit trails.

#### Safety Controls & System Settings

:::accordion Protect Root Drive
Enabling this setting in Settings prevents the primary operating system disk from appearing in the Partition Editor, S.M.A.R.T. diagnostics, and Disk Shredding tabs. This safety override protects the host OS from accidental erasure.
:::

:::accordion Clearing Operational History
Technicians can clear the action history logs (Shredding history, S.M.A.R.T. logs, speedtest records, or downloaded ISO files) directly from the Settings panel to reclaim local storage space and maintain operational cleanliness.
:::
