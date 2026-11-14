# Vercel Deployment Guide

This project is fully configured for deployment on [Vercel](https://vercel.com).

---

## Quick Deploy Steps

### Method 1: Deploy from Repository Root (Recommended)

1. Push this project to GitHub/GitLab/Bitbucket.
2. In the Vercel Dashboard, click **Add New...** -> **Project**.
3. Import the repository.
4. Leave **Root Directory** as `./` (default). Vercel will automatically detect `vercel.json` and build the frontend.
5. In **Environment Variables**, add:
   - `VITE_API_BASE_URL`: The URL of your deployed backend (e.g. `https://your-backend.onrender.com` or `https://api.yourdomain.com`).
6. Click **Deploy**.

---

### Method 2: Deploy with Root Directory set to `frontend`

If you prefer to point Vercel directly to the frontend folder:

1. In the Vercel project import settings, click **Edit** next to **Root Directory** and select `frontend`.
2. Framework Preset will auto-detect as **Vite**.
3. In **Environment Variables**, add:
   - `VITE_API_BASE_URL`: The URL of your deployed backend.
4. Click **Deploy**.

---

## Key Configurations Included

1. **SPA Rewrites (`vercel.json` and `frontend/vercel.json`)**:
   Prevents 404 errors when refreshing or directly navigating to client-side routes like `/chat`, `/documents`, `/library`, `/profile`, `/settings`.

2. **CORS Support for Vercel Domains**:
   The FastAPI backend includes `allow_origin_regex=r"^https?://([a-zA-Z0-9-]+\.)*vercel\.app$"` by default, allowing production and preview deployments on Vercel to communicate with the backend without CORS blocks.

3. **Dual API Routing**:
   All endpoints support both `/api/<route>` and `/<route>` formats (e.g. `/api/chat` and `/chat`, `/api/health` and `/health`, `/api/documents` and `/documents`, `/api/profile` and `/profile`).

4. **Zero Mixed Content Errors**:
   The frontend Axios client (`frontend/src/services/api.js`) automatically handles production environments cleanly:
   - If `VITE_API_BASE_URL` is configured, it trims trailing slashes and connects to the backend.
   - If `VITE_API_BASE_URL` is omitted in production, it uses relative `/api` paths to avoid mixed content (HTTP vs HTTPS) blocks.
   - In local development (`npm run dev`), it proxies `/api` requests to `http://127.0.0.1:8001`.
