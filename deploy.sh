#!/usr/bin/env bash
# Usage: ./deploy.sh PROJECT_ID [REGION]     (needs gcloud, logged in, billing enabled)
set -euo pipefail
PROJECT="${1:?usage: ./deploy.sh PROJECT_ID [REGION]}"
REGION="${2:-asia-south1}"
[ -f assets/catalog.json ] || { echo "assets/catalog.json missing - run scripts/fetch_indian_music.py first"; exit 1; }
gcloud config set project "$PROJECT"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
gcloud artifacts repositories describe swaradb --location "$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create swaradb --repository-format=docker --location "$REGION"
gcloud builds submit --config cloudbuild.yaml --substitutions=_REGION="$REGION" .
echo "Deployed at:"
gcloud run services describe swaradb --region "$REGION" --format 'value(status.url)'
