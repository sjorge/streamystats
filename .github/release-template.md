# StreamyStats v2 Release {{version}}

## ⚠️ **BREAKING CHANGE: v1 → v2 Migration Required**

**🛑 This is a major breaking change upgrade from v1 to v2.** The entire stack has changed including Docker images, Docker compose file and database architecture.

**Docker Image Changes:**
- ❌ **Discontinued:** `streamystats:edge`
- ✅ **New:** `streamystats-v2-*:latest`

## 🚀 What's New

<!-- Release-please will automatically populate the changelog here -->

### ⚠️ **MANDATORY for ALL v1 Users**

**1. Backup Your Current v1 Data:**

**1.1 Dump database**

```bash
docker exec -t streamystats_db pg_dumpall -c -U postgres > backup.sql
```

**1.2 Export .db file from Streamystats settings**

**2. Convert Export to JSON (for import):**
```bash
# Convert your .db file (exported from settings) to JSON format
sqlite3 input.db -json "SELECT * FROM playback_sessions;" > exported_data.json
```

**3. Complete Fresh v2 Setup:**
```bash
# IMPORTANT: Remove old data volumes completely
docker compose down -v

# Get the new v2 docker-compose.yml
curl -o docker-compose.yml https://raw.githubusercontent.com/fredrikburmester/streamystats/docker-compose.yml

# Start fresh v2 setup
docker compose up -d
```

**4. Import Your Data:**
- Navigate to StreamyStats v2 → Settings → **Legacy Import**
- Upload your exported JSON file
- Follow the import wizard

---

## 📦 Fresh Installation & Upgrade Instructions

### Docker Installation (Recommended)

```bash
# Get the new v2 docker-compose.yml
curl -o docker-compose.yml https://raw.githubusercontent.com/fredrikburmester/streamystats/{{tag}}/docker-compose.yml
docker-compose up -d
```