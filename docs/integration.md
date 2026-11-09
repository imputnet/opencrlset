# Integrating opencrlset

## In a browser you build

Chromium only installs a CRLSet signed by the key whose hash is
`kCrlSetPublicKeySHA256` (in
`chrome/browser/component_updater/crl_set_component_installer.cc`),
which is Google's. opencrlset publishes the CRLSets, not signed CRXs,
so you sign them with your own key and serve them from your own update
server:

1. Replace the hash with your key's. `omaha-publish id key.pem` prints
   it, and the component ID it gives.
2. When `latest.json` names a new build, pack its tier as it is and
   publish it to your feed with [omaha-publish][], with [puffin][]
   patches from earlier builds:

   ```sh
   omaha-publish pack --key key.pem --stored <build-dir>/crlset/<tier> <tier>.crx3
   omaha-publish publish --store s3://bucket/feed --key index.pem \
     --puffin <path> <tier>.crx3
   ```

3. Answer your browsers' update checks from that feed, for example with
   [omaha-server][]: `omaha-server serve --index <feed>/index.json
   --trust index.pub.pem`.

`omaha-publish verify --stored --files <build-dir>/crlset/<tier> <file>`
checks that a CRX packs exactly a build's files, without the key.

**CUP.** Chromium checks a signature on update responses, with
ML-DSA-44 by default, else ECDSA P-256. Either replace the public key in
`components/update_client/request_sender.cc` and sign responses with
yours, or make `EnabledCupSigning()` return `false`.

**Tiers.** `all` is about 145 MB, and the browser keeps it in memory.
Builds expire 7 days after their snapshot, so check for updates well
within that.

## In any Chromium browser

Works without changing the browser, if `chrome://components` lists
**CRLSet**.

1. Find the user data directory: **Profile Path** in `chrome://version`,
   minus its last part.
2. Close the browser, and run:

   ```sh
   scripts/install-crlset.sh <user-data-dir> [standard|priority|all]
   ```

   By hand: delete everything in the user data directory's
   `CertificateRevocation`, then put a build's `crlset/<tier>/crl-set`
   and `manifest.json` in `CertificateRevocation/<sequence>/`. If
   Google's folder stays, the browser keeps using it and deletes yours.

3. `chrome://components` should show a CRLSet version around 29 million.

Nothing updates it after that, so run the script on a schedule, at least
weekly. It can run while the browser is open; the new set loads at the
next start. To go back to Google's, delete `CertificateRevocation` and
restart.

[puffin]: https://chromium.googlesource.com/chromium/src/+/main/third_party/puffin/
[omaha-publish]: https://crates.io/crates/omaha-publish
[omaha-server]: https://crates.io/crates/omaha-server
