# v07 bounded sequential split proof — fake only

On iPad Safari, generate 32 fictional ciphertext-shaped photo records on-demand, 256KiB each, split into <=1MiB parts using v04. The output callback records only counts/digests and discards each blob; production downloading and file persistence are explicitly not tested. Normal manifest must match all emitted descriptions. Forced onPart failure at part 3 must stop processing without returning a manifest. No IndexedDB, files, production data, PIN, or network. This is a small ~8MiB algorithm test, NOT the 120MiB+ full-memory stress/restore test.
