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

2. **Explicit CORS Origins**:
   The FastAPI backend allows only the exact origins configured in `FRONTEND_ORIGINS`. Add the production frontend origin explicitly; preview deployments must also be listed explicitly if they need API access.

3. **Dual API Routing**:
   All endpoints support both `/api/<route>` and `/<route>` formats (e.g. `/api/chat` and `/chat`, `/api/health` and `/health`, `/api/documents` and `/documents`, `/api/profile` and `/profile`).

4. **Zero Mixed Content Errors**:
   The frontend Axios client (`frontend/src/services/api.js`) automatically handles production environments cleanly:
   - If `VITE_API_BASE_URL` is configured, it trims trailing slashes and connects to the backend.
   - If `VITE_API_BASE_URL` is omitted in production, it uses relative `/api` paths to avoid mixed content (HTTP vs HTTPS) blocks.
   - In local development (`npm run dev`), it proxies `/api` requests to `http://127.0.0.1:8001`.

## Deploying the authenticated application

The FastAPI backend must be hosted separately (for example, on Render); Vercel hosts the React frontend. Configure these backend environment variables in Render:

- `MONGODB_URI`: MongoDB Atlas connection string.
- `DATABASE_NAME`: existing Atlas database name or `personal_health_assistant`.
- `JWT_SECRET_KEY`: a private random secret of at least 32 bytes.
- `ACCESS_TOKEN_EXPIRE_MINUTES=15`
- `REFRESH_TOKEN_EXPIRE_DAYS=7`
- `FRONTEND_ORIGINS`: comma-separated exact origins, including the deployed Vercel origin such as `https://your-app.vercel.app`. Do not use wildcard origins.
- `AUTH_COOKIE_SECURE=true`
- `AUTH_COOKIE_SAMESITE=none` when the Vercel and Render origins are on different sites. A shared custom domain is preferable where possible; configure the cookie and CORS origins for those exact hostnames.
- Existing RAG settings such as `GROQ_API_KEY` and `LLM_MODEL`.

Set `VITE_API_BASE_URL` in Vercel to the deployed HTTPS API origin. The browser sends the refresh cookie with credentialed requests; keep the API CORS configuration restricted to your deployed frontend origins. Authentication stores users in the `users` collection and refresh-session hashes in `auth_sessions`; it does not fall back to local account storage when Atlas is unavailable.

For a Render Web Service created from the repository root, use `pip install -r backend/requirements.txt` as the build command and `uvicorn backend.app:app --host 0.0.0.0 --port $PORT` as the start command. Attach persistent storage for `.chroma` and uploaded files if those need to survive service restarts; the Atlas account/session data itself is stored in MongoDB.
