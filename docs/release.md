# Release and upload

## Local

```sh
npm run pack                                      # dist/minutetrail-<version>.zip
CRX_KEY=~/.keys/minutetrail-crx.pem npm run pack:crx   # also dist/minutetrail-<version>.crx
```

`scripts/crx.js` signs the zip into a CRX3 file with no dependencies and no
Chrome binary. Its output is byte-identical to Chrome's own
`--pack-extension` for the same payload and key.

Upload the file under Package → Upload new package. Bump `version` in
`manifest.json` first; the store rejects a repeated version.

## Verified CRX uploads (recommended once published)

After opting in, the store accepts only CRX files signed with your private key,
so a compromised Google account cannot push a malicious update. The store
re-signs accepted uploads with its own key, so the extension ID does not change.

1. Generate an RSA 2048 key outside this folder. Never commit it (`*.pem` is in
   `.gitignore`) and never store it in your Google account:

   ```sh
   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out ~/.keys/minutetrail-crx.pem
   chmod 600 ~/.keys/minutetrail-crx.pem
   ```

2. Print the public key and paste the whole block, including BEGIN/END lines:

   ```sh
   openssl rsa -in ~/.keys/minutetrail-crx.pem -pubout
   ```

3. Dashboard → the item → **Package** → **Verified CRX Uploads** → **Opt in** →
   paste → save. Zip uploads are rejected for this item from then on.

Losing the private key means contacting Chrome Web Store support; replacement
can take up to a week. Back it up. This key is unrelated to the extension ID;
do not put it in the manifest `key` field.

## Publishing from GitHub Actions

`.github/workflows/release.yml` runs on every `v*` tag (or manually). It runs
the tests, checks the tag matches `manifest.json`, packs, signs when a key is
configured, uploads through the Chrome Web Store API with curl, publishes, and
attaches the packages to a GitHub release. No third-party actions touch the
credentials.

### Prerequisite: the first publish is manual

The API only updates an existing item whose listing, privacy answers and
screenshots are already filled in. Publish version 0.1.0 by hand, then copy the
32-letter item ID from the dashboard URL.

### One-time: API credentials

1. Open https://console.cloud.google.com, create a project (any name).
2. APIs & Services → Library → enable **Chrome Web Store API**.
3. APIs & Services → OAuth consent screen (Google Auth Platform → Audience):
   user type **External**, then **Publish app**. Leave it in *Testing* and the
   refresh token expires after 7 days, which breaks the workflow silently.
4. Credentials → Create credentials → **OAuth client ID** → type **Desktop app**.
   Note the client ID and client secret.
5. Get a one-time authorization code. Sign in with the Google account that owns
   the extension. Open in a browser (replace CLIENT_ID):

   ```
   https://accounts.google.com/o/oauth2/auth?response_type=code&access_type=offline&prompt=consent&scope=https://www.googleapis.com/auth/chromewebstore&redirect_uri=http://localhost:8818&client_id=CLIENT_ID
   ```

   The browser lands on `http://localhost:8818/?code=...` and shows a connection
   error; that is expected. Copy the `code` value from the address bar.

6. Exchange it for a refresh token within a few minutes:

   ```sh
   curl -s https://oauth2.googleapis.com/token \
     -d client_id=CLIENT_ID -d client_secret=CLIENT_SECRET \
     -d code=CODE -d grant_type=authorization_code \
     -d redirect_uri=http://localhost:8818
   ```

   Keep `refresh_token` from the JSON reply.

### One-time: repository secrets

Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
| --- | --- |
| `CWS_CLIENT_ID` | from step 4 |
| `CWS_CLIENT_SECRET` | from step 4 |
| `CWS_REFRESH_TOKEN` | from step 6 |
| `CWS_EXTENSION_ID` | 32-letter item ID from the dashboard URL |
| `CRX_KEY_PEM` | full contents of `minutetrail-crx.pem`, only if Verified CRX Uploads is on |

Without `CRX_KEY_PEM` the workflow uploads the zip, which is correct until you
opt in.

### Every release

```sh
# edit "version" in manifest.json and package.json, commit, then:
git tag v0.2.0
git push origin main --tags
```

The workflow fails fast if the tag and manifest disagree. The store reply
`ITEM_PENDING_REVIEW` counts as success; review usually takes hours to days.

### Gotchas

- The refresh token belongs to whoever ran step 5. If that person leaves the
  publisher group, repeat steps 5 and 6 with another owner.
- The API rate limit is 20 publishes per day per item; irrelevant unless
  releases are automated per commit.
- `workflow_dispatch` runs skip the tag check and the GitHub release, and
  upload whatever version the manifest currently has.
