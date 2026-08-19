### fio-based Drive Speed Benchmarks

Disk Hunter executes high-performance I/O speed tests using `fio` (Flexible I/O Tester). It evaluates sequential performance to profile transfer rates.

#### Speed Test Type Options

:::accordion Read Only
Measures the sequential read throughput of the selected partition. This is a safe read operation that does not alter partition files.
:::

:::accordion Write Only
Measures sequential write throughput. Generates a temporary benchmark file (`.fio_test`) inside the mounted filesystem. This file is automatically cleaned up when the test finishes.
:::

:::accordion Read & Write
Executes simultaneous read and write actions to profile full-duplex device capabilities.
:::

#### Speed Test Size Options

:::accordion 1 GB Block Size
A fast, lightweight test block size. Ideal for a quick performance check on standard hard drives and flash media.
:::

:::accordion 10 GB Block Size
An intensive test block size. Bypasses the drive controller's internal cache limits to measure sustained read and write throughput over a longer period.
:::

:::accordion 100 GB Block Size
An exhaustive, enterprise-grade test block size. Recommended for high-performance solid-state drives (SSDs) to measure sustained write/read performance under prolonged heavy I/O workloads. Requires a partition size of at least 101 GB.
:::

:::accordion All (1G, 10G, 100G)
Runs a sequential benchmark suite testing all size blocks in sequence. The system automatically skips larger block test sizes if the target partition capacity does not meet minimum space requirements (11 GB for 10G, 101 GB for 100G).
:::

> [!IMPORTANT]
> Speed test benchmark files are dynamically allocated inside the target drive's partition mount point, preventing direct raw block writes that would destroy partition layouts.
