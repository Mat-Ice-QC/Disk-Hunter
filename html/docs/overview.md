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

#### Interface & Usability Features

:::accordion Disk Overview Layout Toggle
The Disk Overview page supports two layout modes: **Squares** (compact card grid) and **List** (full-width rows). Click the toggle button in the header to switch between them. Your preference is saved across sessions.
:::

:::accordion Drive Image Lightbox
On the Disk Overview page, click any drive image to open a fullscreen lightbox view. The image displays at its full native resolution. Click outside the image or press the close button to dismiss.
:::

:::accordion Batch Disk Selection Toolbar
The Disk Shredding, S.M.A.R.T. Testing, and Speed Test pages include a selection toolbar above the drive list with three controls: **Select All** checks all visible (non-filtered) drive checkboxes at once, **Deselect All** unchecks every drive checkbox, and **Filter** lets you type a keyword (e.g. `860`, `samsung`, `sd`) to show only matching drives. Select All then operates only on the filtered set, enabling rapid batch selection of specific drive models.
:::

:::accordion API Debug Terminal
A floating diagnostic terminal is available on every page when enabled in Settings. It intercepts and logs all API fetch calls (method, URL, response status) and WebSocket events (connect/disconnect/error) in real time. Use it to troubleshoot API connectivity issues or monitor backend interactions.
:::

#### Partition Editor

:::accordion Partition Editor Overview
The Partition Editor provides a visual interface for creating, deleting, and formatting partitions on physical drives. Drive cards display in a responsive grid with model, path, size, partition table type, and an allocation bar. Click any card to open the partition modal.
:::

:::accordion Batch Wipe
The Batch Operations panel at the top of the page lets you wipe multiple drives at once. Select drives via checkboxes (use Select All / Deselect All / Filter for quick selection), choose a partition table type (GPT or MSDOS), and click "Wipe Selected Drives". A confirmation dialog lists all target drives before proceeding. This destroys all existing partitions and data on each selected drive.
:::

:::accordion Partition Modal
The modal shows disk info tiles (model, size, table type, sector size), a visual partition graphic with colored blocks representing each partition and free space, an action bar with six operations (New Table, Create, Format, Delete, Name, Manage Flags), and a partition table with columns: number, file system, name/label, start, end, size, and flags. Click a partition block in the graphic or a row in the table to select it — both highlight in sync. Selecting free space enables partition creation; selecting an existing partition enables formatting, deletion, naming, and flag management.
:::
