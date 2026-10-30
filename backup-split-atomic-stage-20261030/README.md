# MSW split atomic restore v06 fictional-only

New fake-only IndexedDB `msw_split_atomic_v06_fake_only_20261030` hosted under the test repo Pages origin, not production. Uses PBKDF2-HMAC-SHA256 250k + AES-GCM 256 and the v04 split manifest. Before touching the fake DB, authenticates the test PIN, decrypts the index, verifies links, decrypts each synthetic photo. Then exercises missing part and wrong PIN (must not change initial DB), forced transaction abort (must roll back all writes), then atomic success (new photo records and index appear, obsolete photo record removed).

This does not use the production database or real patient data; file selection is intentionally unavailable. Not clinical-ready: must test real backup schemas and JPEG validation, iPad Safari with >120MiB synthetic payload, memory-safe import and multi-file user flow before production rollout.
