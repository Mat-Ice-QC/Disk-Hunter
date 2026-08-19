# Security Audit & Hardening Documentation

This document provides a comprehensive report of the security audit performed on the Disk Hunter codebase and details the patches implemented to secure the application against path traversal, arbitrary file actions, and argument/flag injections.

---

## 1. Directory Traversal in Data Management

### Finding
The data management router utilized a function `get_safe_path` to verify that requested file paths remained within the defined persistent data directory (`DATA_DIR`). The implementation checked path containment via:
```python
if not safe_path.startswith(os.path.abspath(base_dir)):
```
This check was vulnerable to sibling directory traversal. If `base_dir` resolved to `/app/data`, a request parameter targeting `../data-secret` would resolve to `/app/data-secret`. Since `/app/data-secret` starts with the prefix `/app/data`, the path verification succeeded, allowing unauthorized access to files outside of `DATA_DIR`.

### Fix Applied
In [data_management.py](file:///home/matice/Disk-Hunter/backend/api/data_management.py), the `get_safe_path` utility was hardened by appending a trailing directory separator (`os.sep`) to the absolute base directory path before prefix comparison:
```python
base_abs = os.path.abspath(base_dir)
if not base_abs.endswith(os.sep):
    base_abs += os.sep
safe_path = os.path.abspath(os.path.join(base_abs, requested_path))
if not safe_path.startswith(base_abs):
    raise HTTPException(status_code=403, detail="Access denied")
```
This guarantees that path verification matches complete directory segments rather than simple substring prefixes.

---

## 2. Arbitrary File Read in Report Server

### Finding
The endpoint `/api/reports/{filename}` served PDF erasure certificates from `REPORTS_DIR`. The original code constructed the file path by concatenating the raw path parameter directly:
```python
file_path = f"{REPORTS_DIR}/{filename}"
```
An attacker could pass a traversal sequence (such as `../../../../etc/passwd`) as the filename, bypass the intended directory restriction, and download any file readable by the backend process.

### Fix Applied
In [reports.py](file:///home/matice/Disk-Hunter/backend/api/reports.py), input sanitization was applied to strip all directory paths and traversal components using `os.path.basename`:
```python
safe_filename = os.path.basename(filename)
file_path = os.path.join(REPORTS_DIR, safe_filename)
```
This restricts the file resolution strictly to the `REPORTS_DIR` boundary.

---

## 3. Arbitrary File Read in Image Assets serving

### Finding
The endpoints `/api/images/drives/{filename}` and `/api/images/pool/{filename}` lacked path validation, enabling arbitrary image reads or traversal lookups outside of the mapped directory structures.

### Fix Applied
In [images.py](file:///home/matice/Disk-Hunter/backend/api/images.py), both endpoints were refactored to wrap the `filename` parameter inside `os.path.basename` before mapping the target image path.

---

## 4. Path Traversal & Arbitrary Writes in ISO Module

### Finding
- **File Overwrites:** In the download endpoint `/api/iso/download`, the user-supplied filename was directly joined with `ISO_DIR`, letting users write downloaded contents to arbitrary locations on the host system filesystem.
- **Arbitrary Target Flashing:** In the write endpoint `/api/iso/write`, the `device` parameter was concatenated directly into a `/dev/{device}` string. If a user provided a traversal sequence such as `../app/data/wipe_history.json`, the writing process would write the ISO image directly onto host file paths instead of physical block devices.

### Fix Applied
In [iso.py](file:///home/matice/Disk-Hunter/backend/api/iso.py), the following validation measures were introduced:
- The `filename` parameters are sanitized using `os.path.basename`.
- The target `device` argument is validated against a strict regular expression ensuring only clean, single-segment alphanumeric and dash/underscore names are accepted:
  ```python
  if not re.match(r"^[a-zA-Z0-9_-]+$", req.device):
      raise HTTPException(status_code=400, detail="Invalid device name format.")
  ```

---

## 5. Log Container Path Traversal and Argument Injection

### Finding
Container log retrieval endpoints (`/api/shredding/logs/{container_name}`, `/api/smart/logs/{container_name}`, and `/api/speedtest/logs/{container_name}`) accepted unvalidated container names.
- This allowed path traversal when looking up completed run logs stored as `.log` files in `container_logs/` directories.
- In cases where the container was running, the name was passed directly to subprocess calls mapping to `docker logs <container_name>`, opening up potential flag injection risks.

### Fix Applied
Strict regular expression validations were applied to all three routes to enforce container names containing only alphanumeric characters, dashes, underscores, and dots:
- **Shredding Logs:** Enforced matching `^disk_hunter_wipe_[a-zA-Z0-9_.-]+$` in [shredding.py](file:///home/matice/Disk-Hunter/backend/api/shredding.py).
- **Speed Test Logs:** Enforced matching `^disk_hunter_speedtest_[a-zA-Z0-9_.-]+$` in [speedtest.py](file:///home/matice/Disk-Hunter/backend/api/speedtest.py).
- **SMART Diagnostics Logs:** Standardized matching `^disk_hunter_smartctl_[a-zA-Z0-9_.-]+$` in [smartctl.py](file:///home/matice/Disk-Hunter/backend/api/smartctl.py).

---

## 6. Device Path Validation

### Finding
Endpoints such as partition manipulation or querying accepted user-supplied drive paths (e.g. `drive=/dev/sda`) without verifying that they targeted legitimate block devices under the `/dev/` directory.

### Fix Applied
In [partition.py](file:///home/matice/Disk-Hunter/backend/api/partition.py), a strict regular expression validation was added to the input parameters of `/api/partitions` and `/api/partitions/action`:
```python
if not re.match(r"^/dev/[a-zA-Z0-9_-]+$", drive):
    return {"status": "error", "message": "Invalid device path format."}
```
This restricts input devices exclusively to standard, non-nested nodes under `/dev/`.
