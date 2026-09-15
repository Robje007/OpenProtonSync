# Proton SDK 0.21 upgrade

Updated on 2026-09-15: Drive SDK **0.19.2 → 0.21.1**, Proton Crypto **2.0.0 → 2.1.3**.

## Upstream changes

From the [official Drive SDK changelog](https://github.com/ProtonDriveApps/sdk/blob/main/client/js/CHANGELOG.md):

| Version | Changes                                                                                                                                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.20.0  | Direct active revision metadata; public-link terminology renamed to URL access; optional additional-metadata helpers; clearer errors and logging when commits fail; fixes for listing locked volumes and files without previews. |
| 0.20.1  | Return already-decrypted nodes before propagating listing errors.                                                                                                                                                                |
| 0.21.0  | Fetch current child identifiers from the server when listing folders.                                                                                                                                                            |
| 0.21.1  | Support the new folder-size calculation.                                                                                                                                                                                         |

From the [official Crypto changelog](https://github.com/ProtonMail/WebPackages/blob/main/packages/crypto/CHANGELOG.md):

- 2.0.1: fixes to exported types.
- 2.1.0: streaming message encryption and decryption APIs.
- 2.1.1: restores streaming hash calculation to fix blocking behavior.
- 2.1.2: OpenPGP.js 6.3.1 with internal improvements.
- 2.1.3: internal mail-parser dependency organization.

These are upstream capabilities; this update does not add sharing, folder-size or metadata-editing screens.

## OpenProtonSync integration

- Adapt direct revision metadata and `isSharedByUrl` to the sync engine's internal types. Preserve revision identifiers, SHA-1 hashes, original file sizes and modification dates.
- Surface incomplete metadata and listing errors instead of treating an incomplete result as proof that remote files were deleted.
- Replace the custom Drive encryption wrapper with Proton's `OpenPGPCryptoWithCryptoProxy` and Crypto API. This uses the official handling of encryption options, key references and signature contexts.
- Implement the SDK account method for all active addresses. Existing stored armored keys are imported into Proton's key store. Login/SRP remains in the existing authentication layer.
- Keep dependency versions and the Bun lockfile in sync.

## Runtime compatibility patch

`patches/@protontech%2Fcrypto@2.1.3.patch` is applied by Bun on installation:

- Use the package's server-compatible `openpgp` export instead of the browser-only `openpgp/lightweight` export. Both resolve to Proton's OpenPGP fork within its crypto package.
- Add three stream type assertions to bridge the package's WebStream declarations and native stream declarations. These assertions do not change runtime behavior or disable project type checking.

Docker copies this patch before its frozen-lockfile install. Review the patch when updating Crypto; remove it once upstream supports the runtime and types directly.

## Two-way status

Two-way sync remains an **OpenProtonSync beta**. SDK version numbers do not certify this application's conflict handling or recovery behavior.

The [official SDK status](https://github.com/ProtonDriveApps/sdk#current-status), checked on 2026-09-15, still says that third-party production use is not ready. The high-level Sync module is coming soon. Proton currently targets a cryptographic model migration for late 2026/early 2027; this is an estimate, and further SDK upgrades may be necessary.

## Validation

Automated checks cover revision adaptation, incomplete listings, existing address-key import, encryption/decryption and signature-context verification, plus the existing authentication, exclusion and two-way conflict-policy tests.

No live Proton-account upload/download or multi-device reconciliation was exercised during this upgrade. Passing local tests does not change the beta status.
