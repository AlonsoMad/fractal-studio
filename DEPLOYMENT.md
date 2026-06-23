# Deployment Guide

## GitHub Upload (Without Local Git User)

Since you don't have the correct git user configured on this machine, you have **two options**:

### Option 1: GitHub CLI (Recommended)
```bash
# Install GitHub CLI if not installed
brew install gh

# Authenticate (will open browser)
gh auth login

# Create and push repository
gh repo create fractal-studio --public --source=. --remote=origin --push
```

### Option 2: Manual Upload via GitHub Web Interface
1. Go to https://github.com/new
2. Create a new repository named `fractal-studio`
3. **DO NOT** initialize with README, .gitignore, or license
4. After creation, you'll see commands like:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/fractal-studio.git
   git branch -M main
   git push -u origin main
   ```
5. Run those commands in your terminal (GitHub will prompt for authentication)

### Option 3: Use Personal Access Token
1. Generate token at: https://github.com/settings/tokens
2. Select scopes: `repo` (full control)
3. Copy the token
4. Push with token:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/fractal-studio.git
   git branch -M main
   git push -u origin main
   # When prompted for password, paste your token
   ```

## Vercel Deployment

### Step 1: Connect to Vercel
1. Go to https://vercel.com
2. Sign in with GitHub
3. Click "Add New Project"
4. Import your `fractal-studio` repository

### Step 2: Configure Build Settings
Vercel should auto-detect these settings (already configured in `vercel.json`):
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Step 3: Environment Variables (if needed)
If you have any environment variables in `.env.example`:
1. Go to Project Settings → Environment Variables
2. Add each variable from `.env.example`

### Step 4: Deploy
Click "Deploy" and wait for build to complete.

## Post-Deployment

Your site will be available at:
- Production: `https://fractal-studio.vercel.app` (or custom domain)
- Preview: Automatic deployments for every push to non-main branches

## Continuous Deployment

Every push to `main` branch will automatically trigger a new deployment on Vercel.

## Local Development

```bash
npm install
npm run dev
```

## Build Locally (Test Before Deploy)

```bash
npm run build
npm run preview
```
