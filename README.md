# Disk Hunter

Disk Hunter is an all-in-one, web-based IT disk management utility designed for testing, managing, wiping, and formatting drives. Built with a modern, responsive web interface, it interacts with a robust Python backend that leverages Docker containers to securely isolate privileged disk operations.

## Key Features

- **Dashboard Overview:** Instantly view all connected drives, their sizes, models, serial numbers, interfaces, partition tables, and graphical representations of partition structures.
- **Secure Disk Shredding:** Perform secure data destruction using industry-standard wiping methods (via `nwipe`). Monitor real-time terminal logs directly in the browser and automatically generate PDF Certificates of Erasure upon completion.
- **S.M.A.R.T. Diagnostics:** Run and monitor Short or Extended S.M.A.R.T. self-tests. View raw output and parsed attribute tables with overall health assessments. Historical test logs are stored for auditing.
- **Visual Partition Editor:** A GUI-driven partition manager powered by `parted`. Modify partition tables (GPT/MBR), create partitions from unallocated space, delete partitions, and format file systems (ext3, ext4, fat32, ntfs) with an intuitive click-and-drag block interface.
- **Audit History:** Dedicated logging pages for both shredding operations and S.M.A.R.T. test results, ensuring compliance and easy record-keeping.
- **Customizable Settings:** Upload custom drive model images, customize branding for erasure certificates, manage datacenter tags, and enable the "Protect Root Drive" safety feature to prevent accidental modification of the host OS drive.

## Architecture

- **Frontend:** Vanilla HTML, CSS, and JavaScript with a sleek dark-mode UI.
- **Backend:** Python FastAPI server handling API requests and orchestrating Docker containers.
- **Workers:** Specific disk tools (`parted`, `smartmontools`, `nwipe`) are containerized to ensure modularity and security when running privileged tasks.

## TODO

- [ fix settings page ] 
- [ fix the style of the partition module it looks like doodoo] 
- [ fix the smart test live reporting ] 
- [ add login with ldap] 
