# Deployment Guide

Since this is a multiplayer game with a real-time server, you need to host the **Frontend** (Visuals) and **Backend** (Game Logic) separately to play with friends over the internet without ngrok.

## 1. Backend (The Game Server)
We'll use **Render** (it has a free tier for Node.js servers).

1.  Push this code to a GitHub repository.
2.  Go to [dashboard.render.com](https://dashboard.render.com).
3.  Click **New +** -> **Web Service**.
4.  Connect your GitHub repo.
5.  Render will detect the `render.yaml` file I created and set it up automatically.
6.  **Copy the URL** Render gives you (e.g., `https://snake-io-server.onrender.com`).

## 2. Frontend (The Website)
We'll use **Netlify**.

1.  Go to [app.netlify.com](https://app.netlify.com).
2.  **Add new site** -> **Import from existing project**.
3.  Connect the same GitHub repo.
4.  It will detect `netlify.toml` and set the build settings automatically.
5.  **Crucial Step:** Click **Site settings** -> **Environment variables** -> **Add a variable**.
    *   Key: `VITE_API_URL`
    *   Value: `YOUR_RENDER_URL_FROM_STEP_1` (e.g., `https://snake-io-server.onrender.com`)
6.  Trigger a new deploy.

## Local Development
To play locally, just run:
1.  `npm run server`
2.  `npm run dev`
It will still fallback to `localhost:3000` automatically!
