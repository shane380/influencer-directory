# Apify Instagram Integration Setup

## Overview

The Instagram username lookup has been migrated from RapidAPI to Apify to resolve rate limiting issues.

## What Changed

- **New API Route:** `/api/instagram-apify` (created)
- **Updated Component:** `add-influencer-dialog.tsx` now tries Apify first, falls back to RapidAPI
- **Fallback Behavior:** If Apify is not configured, the system automatically falls back to RapidAPI

## Setup Instructions

### 1. Get Your Apify API Token

1. Go to [Apify Console](https://console.apify.com/account/integrations)
2. Sign in or create an account
3. Navigate to **Settings** → **Integrations**
4. Copy your **API token**

### 2. Add Token to Environment

Edit `.env.local` and add your token:

```bash
APIFY_API_TOKEN=your_apify_token_here
```

The placeholder has already been added for you.

### 3. Test the Integration

Run the test script to verify everything works:

```bash
npx tsx scripts/test-apify-instagram.ts
```

This will:
- Test the Apify Instagram Profile Scraper
- Show you the exact field structure returned
- Verify all required fields are available
- Display a sample profile (defaults to @natgeo)

### 4. Restart Your Dev Server

After adding the token, restart your Next.js dev server:

```bash
# Stop the current server (Ctrl+C)
# Start it again
npm run dev
```

### 5. Test in the App

1. Open your app
2. Go to a campaign
3. Click "Add Influencer"
4. Try looking up an Instagram username

You should see:
- ✅ No more rate limiting errors
- ✅ Faster lookups
- ✅ More reliable results

## How It Works

### Automatic Fallback

The system is smart:

1. First tries `/api/instagram-apify` (Apify)
2. If Apify returns 500 (not configured), automatically tries `/api/instagram` (RapidAPI)
3. Your app continues working even without the Apify token

### When You're Ready

Once Apify is working:

1. Monitor for a few days to ensure stability
2. Remove the RapidAPI endpoint (`src/app/api/instagram/route.ts`)
3. Remove `RAPIDAPI_KEY` from `.env.local`

## Cost Comparison

### RapidAPI (Current)
- ❌ Experiencing rate limits
- Price: Check your plan

### Apify (New)
- ✅ No rate limiting issues
- Free tier: $5 credit/month
- Instagram Profile Scraper: ~$0.01-0.05 per profile
- You're already using Apify for post scraping

## Troubleshooting

### "Instagram API not configured" Error

This means `APIFY_API_TOKEN` is not set in `.env.local`. Add it and restart the server.

### Test Script Shows "No results returned"

- Verify your token is correct
- Check that you have Apify credits
- Try a different username (some profiles may be private or unavailable)

### Still Getting Rate Limits

If you're still seeing rate limit errors, it means:
- Apify is not configured (missing token)
- The system is falling back to RapidAPI
- Add the Apify token to resolve this

## Files Modified

- ✅ `src/app/api/instagram-apify/route.ts` - New Apify endpoint
- ✅ `src/components/add-influencer-dialog.tsx` - Updated to use Apify with fallback
- ✅ `.env.local` - Added APIFY_API_TOKEN placeholder
- ✅ `scripts/test-apify-instagram.ts` - Test script
- ✅ `package.json` - Added apify-client and dotenv dependencies

## Support

If you encounter issues:
1. Run the test script first: `npx tsx scripts/test-apify-instagram.ts`
2. Check the console logs in your browser
3. Verify your Apify token is valid and has credits

## Next Steps

1. Add your Apify token to `.env.local`
2. Run the test script
3. Restart your dev server
4. Test adding an influencer
5. Monitor for a few days
6. Remove RapidAPI when confident
