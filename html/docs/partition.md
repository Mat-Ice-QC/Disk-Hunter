### Partition Editor & File Systems

Allows partitioning block devices using MBR or GPT tables, creating volumes, and formatting with standard file systems.

| File System | Compatibility | Use Case |
|---|---|---|
| **ext4** | Linux Native | Standard Linux file system with journaling support. Optimized for storage servers. |
| **NTFS** | Windows Native, Linux Read/Write | Primary file system for modern Windows installations. Works well for external hard drives. |
| **FAT32** | Universal Compatibility | Universal standard for thumb drives. Limited to 4GB maximum file size. |

#### Partition Table Type (Label)

:::accordion GPT (GUID Partition Table)
The modern standard. Required for disks larger than 2TB, supports UEFI booting, and allows up to 128 primary partitions.
:::

:::accordion MSDOS (Master Boot Record / MBR)
The legacy partition table format. Limited to a maximum of 4 primary partitions and 2TB disk capacities. Compatible with old BIOS booting.
:::

:::accordion Other Architectures (AIX, BSD, Mac, Loop, Sun)
Specific label styles for non-standard target systems (e.g. AIX systems, BSD slices, Apple HFS systems, Sun SPARC hosts, or single loopback file mapping).
:::

#### File System Formats

:::accordion ext4 / ext3 / ext2
The default filesystem family for Linux. ext4 is robust with journaling features. ext2 is non-journaled, minimizing overhead on solid-state drives.
:::

:::accordion ntfs
Microsoft Windows NTFS. Supports files larger than 4GB, compression, and permission mapping. Fully read/write operational under Linux.
:::

:::accordion fat32 / fat16
Classic DOS FAT filesystems. Globally read/write compatible across Windows, macOS, Linux, and embedded hardware. Note that FAT32 restricts files to a maximum of 4GB.
:::

:::accordion btrfs / xfs
Next-generation file systems. btrfs offers advanced copy-on-write snapshots and subvolumes. xfs excels at high-performance parallel I/O operations.
:::
