# Project-Local ESP-IDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision and use an ESP-IDF v6.0.2 toolchain scoped to each Attraccess checkout.

**Architecture:** The setup script owns a gitignored `.tools/esp-idf` checkout and installs its ESP32-S3 tools. The firmware build script prefers that checkout before any explicit or global ESP-IDF installation, so its existing bootstrap mechanism exports the project-local toolchain automatically.

**Tech Stack:** Bash, Python 3, ESP-IDF v6.0.2, Nx.

## Global Constraints

- Use ESP-IDF `v6.0.2`, matching `.github/actions/esp-idf-toolchain/action.yml`.
- Store the checkout at `.tools/esp-idf` and do not modify global ESP-IDF installations.
- Keep `.tools/` out of version control.

---

### Task 1: Provision the project-local toolchain

**Files:**
- Modify: `scripts/setup-dev-dependencies.sh:162-211`
- Modify: `.gitignore`
- Test: `scripts/setup-dev-dependencies.sh` execution output

**Interfaces:**
- Consumes: repository root from `REPO_ROOT`.
- Produces: `.tools/esp-idf/export.sh` at ESP-IDF `v6.0.2` with ESP32-S3 tools installed.

- [ ] **Step 1: Establish the expected project-local checkout state**

Run:

```bash
test -f .tools/esp-idf/export.sh
```

Expected: FAIL before the setup script provisions the local checkout.

- [ ] **Step 2: Update the setup script and ignore rule**

Define `ESP_IDF_PATH="$REPO_ROOT/.tools/esp-idf"`. Make `check_esp_idf` require that path and `install_esp_idf` clone or update it to `v6.0.2`, then run `"$ESP_IDF_PATH/install.sh" esp32s3`. Add `.tools/` to `.gitignore`.

- [ ] **Step 3: Run setup to provision the toolchain**

Run:

```bash
bash scripts/setup-dev-dependencies.sh
```

Expected: output identifies ESP-IDF v6.0.2 at `.tools/esp-idf`, with no writes to `~/esp/esp-idf`.

### Task 2: Prefer the project-local toolchain during firmware builds

**Files:**
- Modify: `apps/attractap/firmware/build_firmwares.py:124-136`
- Test: `pnpm nx run attractap-firmware:build`

**Interfaces:**
- Consumes: `.tools/esp-idf/export.sh` from Task 1.
- Produces: firmware build commands sourced from ESP-IDF v6.0.2.

- [ ] **Step 1: Make the firmware lookup prefer the repository toolchain**

Add the repository-root-relative `.tools/esp-idf` candidate before `IDF_PATH` and global locations in `find_idf_export`.

- [ ] **Step 2: Verify the full firmware build**

Run:

```bash
pnpm nx run attractap-firmware:build
```

Expected: all firmware variants build successfully with ESP-IDF v6.0.2.
