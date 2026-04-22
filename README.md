# VARINO TRAVELS APP

Internal single-user quotation builder for **Varino Travels**.

## Features

- Single-page, mobile-friendly workflow (no login)
- Client/trip/pricing input form
- Auto pricing: subtotal + margin = final quotation value
- Preset and manual add-ons
- Claude API itinerary generation
- Auto-generated editable transport plan
- Local save/reopen/edit of quotations (browser localStorage)
- Professional PDF export with all required sections
- Copy full quotation text to clipboard

## Tech Stack

- React + Vite
- jsPDF + jspdf-autotable
- Claude API (Anthropic)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Open the URL shown in terminal (usually `http://localhost:5173`).

## Usage

1. Fill client, trip, and pricing details.
2. Select preset add-ons and/or add manual add-ons.
3. Add Claude API key and click **Generate Itinerary**.
4. Click **Auto Generate Transport** and edit as needed.
5. Update includes/excludes/terms/policies.
6. Click **Save** to store locally.
7. Click **Download PDF** to export quotation.
8. Click **Copy Text** to copy full quotation content.

## Claude API

Recommended: use **Proxy Mode** by setting:

```bash
VITE_CLAUDE_PROXY_URL=https://your-backend-or-firebase-function/claude-itinerary
```

Your proxy endpoint should accept `{ prompt }` and return JSON with either:

- `{ "text": "Day 1: ...\\nDay 2: ..." }`, or
- Anthropic-style `content` array with text blocks.

Direct browser API key mode is available only for quick internal testing and is less secure.

## Build

```bash
npm run build
```

## Deployment (Simple)

### Option 1: Vercel / Netlify

- Import this repository
- Build command: `npm run build`
- Output directory: `dist`

### Option 2: Firebase Hosting

1. Install Firebase CLI:

```bash
npm install -g firebase-tools
```

2. Build app:

```bash
npm run build
```

3. Initialize and deploy:

```bash
firebase login
firebase init hosting
firebase deploy
```

Use `dist` as the public directory when prompted.
