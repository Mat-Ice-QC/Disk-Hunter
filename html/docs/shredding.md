### Disk Shredding Standards

For SATA/SAS HDDs and SSDs, Disk Hunter invokes `nwipe` inside isolated workers. Choose the algorithm that satisfies your organization's compliance criteria:

| Wipe Standard | Passes | Description |
|---|---|---|
| **Fill Zeros** | 1 | Fastest method. Overwrites all addresses with 0x00. Ideal for non-confidential drives. |
| **DoD Short** | 3 | Compliance DoD 5220.22-M Short. Writes Zeros, Ones, then Random bytes with verification. |
| **DoD Full** | 7 | Compliant DoD 5220.22-M Full. Repeat DoD Short cycles with additional complement sweeps. |
| **Gutmann** | 35 | Overkill sanitization method designed to eliminate magnetic signature history on older legacy HDDs. |

#### Wipe Algorithm Options

:::accordion Fill With Zeros (1 Pass)
Writes `0x00` sequentially across all disk address sectors. Ideal for non-sensitive data clearing or preparing a drive for standard reinstallations. Fastest execution time.
:::

:::accordion DoD Short 5220.22-M (3 Passes)
A three-phase sanitization standard. Writes zeros, ones, then a pseudo-random character stream, with pass verification to ensure overwrite success. Highly recommended for commercial reuse.
:::

:::accordion DoD Full 5220.22-M (7 Passes)
An exhaustive seven-pass overwrite cycle. Repeatedly alternates character patterns and complementary values, terminating with a random pass. Used for secure compliance criteria.
:::

:::accordion Gutmann (35 Passes)
The classic Gutmann sanitization sequence. Writes 35 distinct passes using pseudo-random and specific magnetic encoding patterns. Designed for legacy hard magnetic platter HDDs.
:::

:::accordion PRNG Stream (Random Pass)
A single-pass sanitization standard that fills every address sector with a continuous stream of random bytes. Faster than multi-pass algorithms but highly effective at preventing simple recovery.
:::

#### Verification Settings

:::accordion No Verification
Skips reading back drive sectors after writing. Maximizes sanitization throughput and reduces execution times by roughly half.
:::

:::accordion Verify Last Pass Only
Reads back and validates all disk sectors after the final sweep. Offers a solid compromise between security verification and high performance.
:::

:::accordion Verify All Passes
Validates sector states after each and every write sweep. Ensures extreme security and block integrity but significantly increases overall execution time.
:::

> [!WARNING]
> Once disk shredding starts, all partitioning tables, boot sectors, and data blocks are deleted instantly. Ensure you verify the device serial number before execution.
