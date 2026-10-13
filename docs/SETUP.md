# Setup: from empty project to first numbers

Everything here is done once. Replace `YOUR_EMAIL` with the Google account you use for GCP.

## 0. What runs where

| Thing | Where | Identity |
|-------|-------|----------|
| KPI functions (`kpiDaily`, `kpiStatsSnapshot`, ...) and the KPI Firestore | Project `cogvana-kpi` | Service account `kpi-collector` |
| Source databases (read only) | `plot-9fd6e`, `my-register-728ff`, `mychama1` | Same `kpi-collector` account, read-only role |
| Dry run, local backfill, deploy | Your computer | You, optionally impersonating `kpi-collector` |

Nothing is installed in the source projects and no source project is modified.

## 1. Prepare the KPI project (console, once)

1. Firebase console -> **Add project** -> choose the existing GCP project `cogvana-kpi` (this enables Firebase on it; no new project is created).
2. Upgrade to the **Blaze** plan (required for Cloud Functions and Scheduler). Expected cost at this scale is very small; add a budget alert in Billing (for example USD 5).
3. Firestore -> **Create database** -> Native mode -> choose a location. **This cannot be changed later.** Pick the closest region offered (for example Johannesburg `africa-south1` if listed) and use the same region for `KPI_REGION` in `.env`. Start in production mode (the rules in this repo lock it down).

## 2. Enable APIs on the KPI project

```bash
gcloud config set project cogvana-kpi
gcloud services enable \
  firestore.googleapis.com cloudfunctions.googleapis.com run.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com \
  eventarc.googleapis.com iam.googleapis.com iamcredentials.googleapis.com logging.googleapis.com
```

The source projects need nothing enabled (Firestore is already on).

## 3. Create the service account and grant access

```bash
SA=kpi-collector@cogvana-kpi.iam.gserviceaccount.com
gcloud iam service-accounts create kpi-collector \
  --display-name="KPI collector (reads sources, writes KPI project)" --project=cogvana-kpi

# 3a. On the KPI project: write its own data, write logs
gcloud projects add-iam-policy-binding cogvana-kpi --member="serviceAccount:$SA" --role=roles/datastore.user
gcloud projects add-iam-policy-binding cogvana-kpi --member="serviceAccount:$SA" --role=roles/logging.logWriter

# 3b. On each SOURCE project: read-only Firestore access
for P in plot-9fd6e my-register-728ff mychama1; do
  gcloud projects add-iam-policy-binding "$P" --member="serviceAccount:$SA" --role=roles/datastore.viewer
done

# 3c. On the service account itself: let YOU deploy functions that run as it, and test as it
gcloud iam service-accounts add-iam-policy-binding "$SA" --project=cogvana-kpi \
  --member="user:YOUR_EMAIL" --role=roles/iam.serviceAccountUser
gcloud iam service-accounts add-iam-policy-binding "$SA" --project=cogvana-kpi \
  --member="user:YOUR_EMAIL" --role=roles/iam.serviceAccountTokenCreator
```

Your own account needs permission to change IAM on all four projects (Owner does).

**Limit to know about:** IAM cannot restrict `datastore.viewer` to particular collections, so this account *can* read whole documents (including PMS user documents). The code never does: every query lists the fields it needs, and a test asserts it. Keep that discipline when adding collectors.

## 4. Local tools

- Node.js 22, git
- Google Cloud CLI (`gcloud`)
- Firebase CLI: `npm install -g firebase-tools`

```bash
gcloud auth login
firebase login
# Local runs then behave exactly like the deployed functions (same permissions):
gcloud auth application-default login --impersonate-service-account=kpi-collector@cogvana-kpi.iam.gserviceaccount.com
```

## 5. Put the code in your repo

Keep the repo **private** (it contains revenue rules and project ids).

```bash
unzip cogvana-kpi.zip -d /tmp/kpi-extract
cp -R /tmp/kpi-extract/cogvana-kpi/. /path/to/your/cogvana-kpi/   # note the trailing /.
cd /path/to/your/cogvana-kpi
cp .firebaserc.example .firebaserc          # then set the project id to cogvana-kpi
cp functions/.env.example functions/.env    # values already match; adjust KPI_REGION
cd functions && npm install && npm test     # expect 47 passing
```

## 6. Verify against real data BEFORE deploying

```bash
cd functions
npm run dry-run -- 2026-09-29     # any recent day; reads sources, writes nothing
```

Compare each row with the apps' own screens (SMS top-ups sold that day, subscriptions paid, Chama plans) and with the change in PAY's `platform_stats/totals`. Check the `estimated` column: many rent payments listed there means Paystack's split share is not stored on the transaction.

## 7. Deploy

```bash
cd ..   # repo root
firebase deploy --project cogvana-kpi
```

If the first deploy fails with a Cloud Build permission error, follow the message: it is a known GCP default that changed for newer projects.

## 8. First data

```bash
cd functions
KPI_PROJECT_ID=cogvana-kpi npm run backfill -- 2026-09-01 2026-09-29
```

Then open Firestore in the console: `kpi_values`, `kpi_runs`, `kpi_definitions`. From then on `kpiDaily` (02:00 Nairobi) and `kpiStatsSnapshot` (23:55) run by themselves.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `PERMISSION_DENIED` reading a source | Step 3b missing for that project, or impersonation not active (step 4) |
| `FAILED_PRECONDITION ... index` on Chama | Expected until indexes are merged into the Chama repo; the reader falls back automatically |
| Scheduled job never fires, permission error | Grant `roles/run.invoker` to the service account on the two scheduled functions' Cloud Run services |
| Deploy: "caller does not have permission to act as service account" | Step 3c `serviceAccountUser` missing |
