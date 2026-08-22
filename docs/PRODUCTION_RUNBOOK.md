# WARTRACKER — PRODUCTION OPERATIONAL RUNBOOK

## 1. System Requirements & Prerequisites

- **Runtime**: Node.js v20.x or v22.x LTS.
- **Package Manager**: `pnpm` v9.x or higher.
- **Operating System**: Linux (Ubuntu 22.04 LTS / Debian 12 / RHEL 9 recommended).
- **Hardware Minimum**: 2 vCPUs, 2 GB RAM, 20 GB NVMe/SSD storage.
- **Hardware Recommended**: 4 vCPUs, 8 GB RAM, 50 GB NVMe storage.

---

## 2. Environment Configuration Matrix

Create `.env` in the repository root (or set via systemd / container environment):

```ini
# Server Configuration
PORT=3000
NODE_ENV=production
FRONTEND_URL=http://localhost:5173
TRUST_PROXY=1

# Security & Access Control
API_SHARED_SECRET=YOUR_STRONG_RANDOM_SECRET_KEY_MIN_32_CHARS

# Database & Storage
DATABASE_PATH=/var/lib/wartracker/data/wartracker.db
BACKUP_DIR=/var/lib/wartracker/backups
BACKUP_RETENTION_COUNT=10
BACKUP_STORAGE_DRIVER=local

# Background Jobs & Polling
RSS_FETCH_INTERVAL=60000
AUTO_SUMMARIZE=false

# Ollama LLM Inference Engine (Optional)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
```

---

## 3. Production Deployment with Systemd

### 3.1 Backend Service Unit (`/etc/systemd/system/wartracker-backend.service`)
```ini
[Unit]
Description=WARTRACKER Tactical Intelligence Backend
After=network.target

[Service]
Type=simple
User=wartracker
WorkingDirectory=/opt/wartracker/backend
EnvironmentFile=/opt/wartracker/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
LimitNOFILE=65536

# Security Hardening
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/wartracker
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

### 3.2 Service Commands:
```bash
# Reload systemd configuration
sudo systemctl daemon-reload

# Enable on boot and start
sudo systemctl enable --now wartracker-backend

# View real-time logs
sudo journalctl -u wartracker-backend -f
```

---

## 4. Health Checks & Synthetic Monitoring

Container orchestrators and load balancers should poll the following endpoints:

1. **Liveness Probe**: `GET /api/health`
   - Returns `HTTP 200` with `{"status": "ok"}`.
2. **Readiness Probe**: `GET /api/ready`
   - Validates active SQLite connection and returns `HTTP 200` if database read/write is operational; `HTTP 503` if locked.
3. **Diagnostics**: `GET /api/diagnostics`
   - Returns detailed memory usage, database query latency, and system uptime.

---

## 5. Operational Incident Triage & Playbooks

### 5.1 Database Busy or Locked (`SQLITE_BUSY`)
- **Symptom**: HTTP 500 responses reporting database locking.
- **Root Cause**: Multiple concurrent write processes or database hosted on a network share / cloud sync folder.
- **Resolution**:
  1. Verify `PRAGMA busy_timeout = 5000` is active.
  2. Ensure only a single Node.js process has write access to `wartracker.db`.
  3. Verify database is on local NVMe disk, not NFS/SMB or OneDrive.

### 5.2 Upstream Feed Timeout / Ingestion Failures
- **Symptom**: RSS worker logs connection timeouts from third-party feed servers.
- **Resolution**: Ingestion workers automatically retry with exponential backoff and timeout after 5000ms. Ingestion errors are non-fatal and do not disrupt API responsiveness.
