# v05 standalone synthetic authenticated backup check

- PBKDF2-HMAC-SHA256 250,000 iterations and AES-GCM-256 match production cryptographic parameters, including existing `{iv,ct}` base64 envelopes.
- Fake PIN only. Uses the v04 split format component, verifies manifest hashes, decrypts meta.check and patient index, checks attachment-photo ID mapping, decrypts and authenticates every photo.
- Browser self-test: correct PIN; wrong PIN rejected; missing part rejected; modified ciphertext rejected even if the manifest SHA-256 was recomputed.
- No IndexedDB, real backups, restores, or network. Not deployable to clinical production; memory-safe large import and atomic DB commit are still missing. Previous 105.2MB backup and production unchanged.
