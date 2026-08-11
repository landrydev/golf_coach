# Preserve the original Codex production work before pulling this branch

The original `10_production_saas` directory was added to the parent repository as a broken nested-repository pointer. GitHub contains the pointer but not the referenced source commit. The source may still exist on Aaron's Windows computer.

**Do not delete, reset, or overwrite the local original folder.** Before merging or pulling the beta-recovery branch on that computer, make two private backups.

## 1. Preserve the nested Git history

From PowerShell, replace the first path with the actual workspace path:

```powershell
$Project = 'D:\Projects\golf-coaching-design-blueprint\10_production_saas'
Set-Location $Project

git status
git rev-parse --show-toplevel
git log --oneline --decorate -n 20

git bundle create '..\10_production_saas-local-history.bundle' --all
git bundle verify '..\10_production_saas-local-history.bundle'
```

The bundle may contain private source history. Keep it private and do not attach it to a public issue or commit it to this repository.

## 2. Preserve the exact working tree

This captures uncommitted files as well as committed files. It may include `.env` files or local secrets, so store it privately.

```powershell
Set-Location (Split-Path $Project)
tar.exe -a -c -f '10_production_saas-working-copy.zip' '10_production_saas'
```

After both backups exist, clone the repaired repository into a **new directory** rather than pulling it over the old workspace. Compare the recovered original against the beta-recovery application in a separate branch or repository.

## What this recovery branch does

This branch does not claim to recreate the lost 526-test application byte-for-byte. It replaces the broken pointer with a smaller, source-controlled beta that can be cloned, tested, operated, and evaluated. The original local Codex application should be treated as forensic source until it is backed up and reviewed.
