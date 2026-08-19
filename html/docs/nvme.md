### Native NVMe Secure Erase

NVMe drives support hardware-level secure erasure, executing directly on the drive controller. These are orders of magnitude faster than standard block-overwrite methods.

#### Secure Erase Format Options

:::accordion User Data Format (SES=1)
Triggers the internal NVMe SSD controller to physically overwrite all user data blocks on the flash media. This is a destructive write action that clears all NAND cells, typically taking 1 to 2 minutes depending on drive capacity.
:::

:::accordion Cryptographic Format (SES=2)
Instructs the SSD controller to erase the cryptographic key used to encrypt the user blocks, and generate a new key. Because the key is overwritten, all existing data becomes instantly unrecoverable. Completes in seconds.
:::

:::accordion Controller Compatibility & Fallback
Not all NVMe controllers support Cryptographic Format (SES=2) or even User Data Format (SES=1). If a secure erase is unsupported by your hardware controller, the backend will return a warning status, and you should use standard block-level overwriting (DoD/Zeros) in the Disk Shredding tab.
:::

> [!IMPORTANT]
> To run formatting actions inside Docker containers, the system mounts the primary controller device (e.g. `/dev/nvme0`) alongside the namespace path (e.g. `/dev/nvme0n1`) to issue appropriate `ioctl` command sequences.
