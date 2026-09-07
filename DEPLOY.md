# Deploying openbean

Two targets, one codebase: **Cloudflare Workers** (D1) or a **Docker container**
(`node:sqlite`). Both need the same three externals first: a Google OAuth client,
an S3-compatible bucket, and a JWT secret.

Terse by design. Every step is a command unless it genuinely can't be.

---

## 0. Variables

Set these once in your shell; the rest of the guide substitutes them.

```sh
export PROJECT=my-gcp-project          # GCS only
export BUCKET=openbean-photos
export ORIGIN=https://openbean.example.com   # exact public origin, no trailing slash
```

`ORIGIN` matters more than it looks. It is the OAuth `redirect_uri` base, the
cookie `secure` switch (`https` prefix → secure cookie), and the CORS origin.
Get it wrong and sign-in breaks with no useful error.

---

## 1. Bucket

Photos never pass through the server. The browser PUTs to presigned URLs and GETs
from presigned URLs, so the bucket stays **private** — do not grant `allUsers`.

### Google Cloud Storage

```sh
gcloud storage buckets create gs://$BUCKET \
  --project=$PROJECT --location=us --uniform-bucket-level-access

gcloud iam service-accounts create openbean-photos --project=$PROJECT

gcloud storage buckets add-iam-policy-binding gs://$BUCKET \
  --member=serviceAccount:openbean-photos@$PROJECT.iam.gserviceaccount.com \
  --role=roles/storage.objectAdmin

# HMAC key = the S3 access key pair. Prints accessId + secret; secret shows once.
gcloud storage hmac create openbean-photos@$PROJECT.iam.gserviceaccount.com --project=$PROJECT
```

`accessId` → `S3_ACCESS_KEY_ID`, `secret` → `S3_SECRET_ACCESS_KEY`,
`S3_ENDPOINT=https://storage.googleapis.com`, `S3_REGION=auto`.

### Dev bucket

Local dev should never touch the prod bucket. Make a second one, same service
account (it just needs `objectAdmin` on both buckets — same HMAC key works for
either), CORS scoped to localhost only:

```sh
gcloud storage buckets create gs://$BUCKET-dev \
  --project=$PROJECT --location=us --uniform-bucket-level-access

gcloud storage buckets add-iam-policy-binding gs://$BUCKET-dev \
  --member=serviceAccount:openbean-photos@$PROJECT.iam.gserviceaccount.com \
  --role=roles/storage.objectAdmin

gcloud storage buckets update gs://$BUCKET-dev --cors-file=packages/server/bucket-cors.dev.json
```

Point `packages/server/.env` → `S3_BUCKET` at `$BUCKET-dev`, reusing the same
`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`.

CORS — edit the production origin in `packages/server/bucket-cors.json` first,
keep the two localhost entries or dev uploads break:

```sh
gcloud storage buckets update gs://$BUCKET --cors-file=packages/server/bucket-cors.json
gcloud storage buckets describe gs://$BUCKET --format='value(cors_config)'   # verify
```

### Object size cap

Not enforceable on a presigned PUT. Cap it at the bucket if you care — a GCS
retention/size policy or an R2 lifecycle rule. The app can't.

---

## 2. Google OAuth

Console → APIs & Services → Credentials → _Create OAuth client ID_ → Web application.

- Authorized redirect URI: `$ORIGIN/api/auth/google/callback` — exactly this path.
- Add `http://localhost:8787/api/auth/google/callback` and
  `http://localhost:5173/api/auth/google/callback` for local work.
- Consent screen: scopes `openid email profile`. External + Testing is fine for a
  family app; add each member as a test user, or Publish to skip that.

Client id and secret → `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.

---

## 3. Target A — Cloudflare Workers

### Create the D1 database

```sh
cd packages/server
wrangler d1 create openbean-db          # prints database_id
```

Paste that id into `wrangler.jsonc` → `d1_databases[0].database_id`,
replacing `REPLACE_ME`. `d1 create` has no `--json`, so read it back instead of
scraping stdout:

```sh
ID=$(wrangler d1 info openbean-db --json | jq -r .uuid)
sed -i '' "s/REPLACE_ME/$ID/" wrangler.jsonc
```

### Vars

Edit `wrangler.jsonc` → `vars`. These are plaintext and committed:

| Var                     | Value                                           |
| ----------------------- | ----------------------------------------------- |
| `APP_ORIGIN`            | `$ORIGIN`                                       |
| `BOOTSTRAP_ADMIN_EMAIL` | the one email allowed to self-register as admin |
| `S3_BUCKET`             | `$BUCKET`                                       |
| `S3_ENDPOINT`           | GCS or R2 endpoint from step 1                  |
| `S3_REGION`             | `auto`                                          |
| `MAX_PHOTOS_PER_POST`   | `20`                                            |

### Secrets

```sh
openssl rand -base64 48 | wrangler secret put JWT_SECRET
wrangler secret put GOOGLE_OAUTH_CLIENT_ID
wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
wrangler secret put S3_ACCESS_KEY_ID
wrangler secret put S3_SECRET_ACCESS_KEY

wrangler secret list      # verify all five
```

(The `secrets.required` array in `wrangler.jsonc` is documentation — wrangler
ignores it. Nothing fails at deploy time if a secret is missing; requests do.)

### Deploy

```sh
cd /path/to/openbean
yarn install
yarn deploy    # = yarn build && wrangler d1 migrations apply openbean-db --remote && wrangler deploy
```

`yarn build` must run before `wrangler deploy` — the assets binding points at
`packages/server/public`, which only exists after Vite writes it.

Dry-run the config without shipping:

```sh
cd packages/server && wrangler deploy --dry-run
```

### Custom domain

```sh
wrangler deploy   # first deploy creates openbean.<subdomain>.workers.dev
```

For a custom hostname add to `wrangler.jsonc` and redeploy:

```jsonc
"routes": [{ "pattern": "openbean.example.com", "custom_domain": true }]
```

The zone must be on the same Cloudflare account; the DNS record is created for
you. Whatever hostname you land on **must equal `APP_ORIGIN`** and be in the
bucket CORS list and the OAuth redirect URIs.

---

## 4. Target B — Docker

```sh
cp packages/server/.env.example packages/server/.env
# fill in: APP_ORIGIN, JWT_SECRET, GOOGLE_*, S3_*
# leave SQLITE_PATH alone — the image overrides it to /data/openbean.db

docker build -t openbean .          # from the repo root; the build needs the workspace
docker run -d --name openbean -p 8787:8787 \
  -v openbean-data:/data \
  --env-file packages/server/.env \
  openbean
```

---

## 5. First run

1. Open `$ORIGIN`, sign in with the `BOOTSTRAP_ADMIN_EMAIL` account. That account
   is created as an admin; every other email needs an invite and otherwise
   bounces to `/?error=invite_required`.
2. As that admin, `POST /api/invites` mints codes; share `$ORIGIN/?invite=CODE`.
3. Create a post with a photo and publish it. This is the only end-to-end check
   that proves the bucket CORS _and_ the HMAC key's permissions are right.

---                                                                                                                                                                               |

Logs:

```sh
wrangler tail                 # Workers
docker logs -f openbean       # container
```

---

## 7. Redeploying

```sh
yarn deploy                                    # Workers: build + migrate + deploy
docker build -t openbean . && docker restart openbean   # container
```

New migration files in `packages/server/migrations` apply automatically on both
targets — `--remote` at deploy time on Workers, at process start in Docker.
