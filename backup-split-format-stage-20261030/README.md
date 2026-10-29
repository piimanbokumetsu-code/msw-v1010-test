# MSW Split Format v04 — isolated proof of concept

Extends v03's successful iPad validation with production-shaped `MSWDB-BACKUP` v2 encrypted meta/data/photo record envelopes, preserved unchanged (opaque ciphertext). Bounded per-part exports (up to 48MiB), manifest generated last, SHA-256 / file sizes, run binding, unique IDs, required caller-supplied photo reference check. Prototype has no IndexedDB, backup PIN derivation, or live restore. Synthetic ciphertext-shaped inputs only; NOT suitable for protecting or restoring real patient data.

Unit simulation: successful file generation + verification, missing part refused, size mismatch refused, patient-photo relation mismatch refused. The simulation uses a deterministic digest stub; real browser uses Web Crypto SHA-256. iPad self-test not yet performed. Future: real AES-GCM PIN verification, photo validation, memory-safe streaming, staging and atomic restore, 120MiB+ stress tests, multi-file confirmation.
