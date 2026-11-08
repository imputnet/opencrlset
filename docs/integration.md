# Integrating opencrlset

## In a browser you build

Chromium only installs a CRLSet signed by the key whose hash is
`kCrlSetPublicKeySHA256` (in
`chrome/browser/component_updater/crl_set_component_installer.cc`),
which is Google's. To ship opencrlset:

1. Replace it with the hash of your own RSA key, or opencrlset's.
   `omaha-publish id key.pem` prints it, and the new component ID.
   Update anything in your browser keyed by the old ID.
2. Point the component updater at an update server for that component.
3. Sign the server's responses, or turn CUP off (below).

opencrlset's key, which signs the CRXs it publishes, has component ID
`eaeohkhnmcodmcdcajaholebpdodfncf`:

```cpp
const uint8_t kCrlSetPublicKeySHA256[32] = {
    0x40, 0x4e, 0x7a, 0x7d, 0xc2, 0xe3, 0xc2, 0x32, 0x09, 0x07, 0xeb,
    0x41, 0xf3, 0xe3, 0x5d, 0x25, 0xf7, 0x95, 0xa0, 0x28, 0xa0, 0x76,
    0xff, 0xf8, 0x4d, 0x54, 0xf7, 0x31, 0x01, 0x8a, 0xbf, 0x68,
};
```

**Feeds.** Each tier is published as an update feed under
`feed/<tier>/`: a signed `index.json`, the CRXs, and [puffin][] patches
from the last day's CRXs, about 1% of a full one. They're made with
[omaha-publish][], which can also sign them with your own keys:

```sh
omaha-publish pack --key key.pem --stored <build-dir>/crlset/<tier> <tier>.crx3
omaha-publish publish --store s3://bucket/feed/<tier> --key index.pem \
  [--puffin <path>] <tier>.crx3
```

The same build and key give the same CRX bytes, and
`omaha-publish verify --stored --files <build-dir>/crlset/<tier> <file>`
checks a CRX without the key.

**Update server.** [omaha-server][] answers from a feed: `noupdate` to
browsers that are current, else the patch matching their cached CRX,
then the full one. It trusts only indexes signed by the key you give it,
and reloads the index every few minutes:

```sh
cargo install omaha-server --features cli
omaha-server serve --index https://crls.helium.computer/feed/standard/index.json \
  --trust opencrlset-index.pem
```

`opencrlset-index.pem` is the public key that signs opencrlset's
indexes:

```
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE0sB0qtAieCtoDYz+9mAiFdEwDhh7
Z2P+ICzJHLbSY/vHwdlgAvKrixFSBUhhRQItSO7hc/fOaSBMuRcYvSNq+w==
-----END PUBLIC KEY-----
```

**CUP.** Chromium checks a signature on update responses, with
ML-DSA-44 by default, else ECDSA P-256. Either replace the public key in
`components/update_client/request_sender.cc` and run `omaha-server`
with `--cup-key <version>=<key.pem>`, or make `EnabledCupSigning()`
return `false`.

**Tiers.** `all` is about 145 MB, and the browser keeps it in memory.
Builds expire 7 days after their snapshot, so check for updates well
within that.

No browser has installed one of these CRXs yet: that needs one built
with a different `kCrlSetPublicKeySHA256`.

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

[puffin]: ../.github/actions/puffin
[omaha-publish]: https://crates.io/crates/omaha-publish
[omaha-server]: https://crates.io/crates/omaha-server
