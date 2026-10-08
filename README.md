# SwaraDB – Indian music database

```
swaradb/
├── client/            React + Vite frontend
├── server/            Express API (+ Dockerfile for API-only local use)
├── scripts/           fetch_indian_music.py  (downloads data from MusicBrainz/Wikipedia)
├── assets/            catalog.json is generated here
├── data/              swaradb.sqlite is generated here
├── Dockerfile         single image for Cloud Run (React build + API)
├── docker-compose.yml ephemeral local API container
├── cloudbuild.yaml, deploy.sh   GCP deployment
```

## 1. Get data
    pip install requests
    python scripts/fetch_indian_music.py --email you@example.com --songs --bios

## 2. Run locally
    docker compose run --rm --service-ports api      # API on :3001 (or: cd server && npm install && npm start)
    cd client && npm install && npm run dev          # http://localhost:5173

## 3. Deploy to Google Cloud Run
    ./deploy.sh YOUR_PROJECT_ID asia-south1
