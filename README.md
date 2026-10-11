# Facebook BD-Trend Bot

Posts short, Claude-written text+image Facebook posts about what's trending
in Bangladesh right now, and keeps your Page's About text fresh — fully
automated via GitHub Actions, no server to run or pay for.

## How it works

1. A GitHub Actions workflow runs on a schedule (default: twice a day).
2. It fetches Google's "Daily Trending Searches" feed for Bangladesh (free,
   no API key).
3. It filters out anything that looks like a death, disaster, crime, or
   political flashpoint — see "Safety" below.
4. It picks the first trend you haven't posted about before, and asks Claude
   to write a short Facebook caption about it (Bangla by default).
5. It finds an image for the post — either the picture Google already
   associates with the trend, or a search on Unsplash (free stock photos).
6. It posts the photo + caption to your Facebook Page via the Graph API —
   **as an unpublished draft by default**, so nothing goes live until you've
   reviewed it (see "Going fully live" below).
7. A second, weekly workflow asks Claude to refresh your Page's About text
   based on recent topics.

This first version is **text + image only**. Video is intentionally left
out — real video generation needs a separate paid API (Runway, Pika, etc.)
and is a reasonable phase 2 once this is working and you've picked a
provider/budget.

## What you need to create yourself

I can't sign up for third-party services on your behalf — these all need
your own login/approval. None of them require a credit card for this use
case, except optionally Unsplash at very high volume (unlikely here).

1. A **Meta Developer App** + a **long-lived Page Access Token** for your
   Facebook Page.
2. An **Anthropic API key** (lets the automation call Claude outside of
   this chat).
3. An **Unsplash Access Key** (free; only used if a trend has no picture of
   its own).
4. A **GitHub repository** to hold this code (GitHub Actions is free for
   this amount of usage on a public repo, and on a private repo within the
   free monthly minutes).

Step-by-step for each:

### 1. Create a Meta Developer App and get a Page Access Token

1. Go to https://developers.facebook.com/apps and click **Create App**.
   Choose type **"Business"**, give it any name (e.g. "BD Trend Bot").
2. In your new app's dashboard, add the **Facebook Login** or just use
   **Graph API Explorer** (simplest path, below).
3. Go to https://developers.facebook.com/tools/explorer
   - In the top-right dropdown, select the app you just created.
   - Click **"Get Token" → "Get User Access Token"**.
   - Tick these permissions: `pages_manage_posts`, `pages_read_engagement`,
     `pages_manage_metadata`.
   - Click **Generate Access Token** and approve the prompts (you must be
     an admin of the Facebook Page you want to automate).
4. This token is short-lived (about an hour) — exchange it for a long-lived
   one:
   ```
   curl -i -X GET "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<YOUR_APP_ID>&client_secret=<YOUR_APP_SECRET>&fb_exchange_token=<SHORT_LIVED_USER_TOKEN>"
   ```
   (App ID/Secret are on your app's **Settings → Basic** page.) This gives
   you a user token valid ~60 days.
5. Use that long-lived **user** token to get your **page** token (page
   tokens obtained this way generally don't expire on their own, as long as
   you don't change your Facebook password or remove the app):
   ```
   curl -i -X GET "https://graph.facebook.com/v21.0/me/accounts?access_token=<LONG_LIVED_USER_TOKEN>"
   ```
   Find your Page in the JSON response — note its `"id"` (this is your
   `FB_PAGE_ID`) and its `"access_token"` (this is your
   `FB_PAGE_ACCESS_TOKEN`).

This app stays in **Development Mode** the whole time, which is fine —
Development Mode apps can post to Pages that the app's own admins/developers
manage, with no App Review needed. App Review is only required if you want
other people's Pages to use this, which isn't the case here.

### 2. Get an Anthropic API key

Go to https://console.anthropic.com/settings/keys, sign in, and create a
new API key. Copy it somewhere safe — you won't be able to see it again.

Check https://docs.claude.com/en/docs/about-claude/models for the current
model name and update `CLAUDE_MODEL` in your repo's GitHub Variables if the
one in `scripts/lib/claude.js` has since been replaced (model names/versions
change over time).

### 3. Get an Unsplash Access Key (free)

Go to https://unsplash.com/developers, create an account, click
**"New Application"**, accept the API terms, and copy the **Access Key**
from your new application's page. The free tier (50 requests/hour) is more
than enough for a couple of posts a day.

### 4. Create the GitHub repo

If you don't already have one: go to https://github.com/new, create an
empty repository (public or private, your choice), then from this project's
folder:

```
git init
git add -A
git commit -m "Initial commit: BD trend bot"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

### 5. Add the keys to GitHub

In your new repo: **Settings → Secrets and variables → Actions**.

Under the **Secrets** tab, add each of these (click **New repository
secret**):
- `ANTHROPIC_API_KEY`
- `FB_PAGE_ID`
- `FB_PAGE_ACCESS_TOKEN`
- `UNSPLASH_ACCESS_KEY`

Under the **Variables** tab, add these (not secret, just settings):
- `PAGE_NAME` — your Page's name, e.g. `BD Viral Buzz`
- `POST_LANGUAGE` — `bn` (Bangla), `en` (English), or `banglish`
- `AUTO_PUBLISH` — leave unset or `false` to start (drafts only); set to
  `true` once you've reviewed a few drafts and trust the output

## Testing before anything goes near your real Page

**Step 1 — no credentials needed at all.** From your repo's **Actions**
tab, open "Post a BD trend to Facebook" → **Run workflow** → tick
**dry_run** → **Run workflow**. This fetches real trends, runs the
sensitive-topic filter, and prints what it *would* post — no Claude,
Unsplash, or Facebook calls happen, so this works even before you've set up
any of the keys above.

**Step 2 — with real keys, still safe.** Once your secrets are set, run the
same workflow *without* dry_run, and leave `AUTO_PUBLISH` unset/`false`.
Check the Actions log for the generated caption and image, then check
**Meta Business Suite → your Page → Content → Drafts** — your post will be
sitting there unpublished. Review a handful of these over a few days.

**Step 3 — going fully live.** Once you're happy with the quality and
tone, set the `AUTO_PUBLISH` repository variable to `true`. From then on,
each scheduled run publishes straight to your Page with no manual step.
You can always set it back to `false` at any time.

You can also run everything locally: copy `.env.example` to `.env`, fill
in your keys, `npm run post:dry-run` (no keys needed) or `npm run post`
(uses `.env` — install something like `dotenv-cli`, or just `export` the
variables yourself before running `node scripts/post-trend.js`).

## Safety notes (please read)

This posts to a real, public Facebook Page with no human in the loop by
default once `AUTO_PUBLISH=true`. A few things are built in, but none of
them are a substitute for spot-checking it occasionally:

- **Sensitive-topic filtering, two layers deep.** A keyword blocklist
  (`scripts/lib/safety.js`) skips trends that look like deaths, disasters,
  crime, or unrest before they ever reach Claude. Claude is separately
  instructed to refuse the same categories on its own. Neither is perfect —
  keyword filters miss things worded unusually, and Claude can occasionally
  misjudge borderline topics.
- **Drafts by default.** `AUTO_PUBLISH` defaults to off, so posts queue as
  unpublished drafts until you deliberately turn it on.
- **No reposting.** `data/posted.json` tracks every trend already covered
  so the same topic doesn't get posted twice.
- **Rate-limited by design.** The default schedule is twice a day — resist
  the urge to post more often than that; it reads as spam and Meta may
  throttle or restrict the Page.
- Consider occasionally skimming `data/posted.json` and the Page's recent
  posts yourself, especially in the first few weeks.

## Customizing

- **Posting schedule** — edit the `cron:` lines in
  `.github/workflows/post.yml` (cron times are always UTC; Bangladesh is
  UTC+6).
- **Tone/length/hashtag style** — edit the prompt text in
  `scripts/lib/claude.js` (`writeTrendCaption`).
- **Language** — set the `POST_LANGUAGE` repo variable to `bn`, `en`, or
  `banglish`.
- **Image source** — `scripts/lib/image.js`; swap in a different stock
  photo API or an AI image-generation API here later if you want to move
  beyond stock photos.
- **Adding video later** — once you've picked a video-generation provider,
  add a `scripts/lib/video.js` following the same pattern as `image.js`,
  and post it via the Graph API's `/{page-id}/videos` endpoint instead of
  `/photos`.

## Troubleshooting

- **"Error validating access token" / permission errors** — your Page
  token expired or was generated without the right permissions. Redo
  step 1 above (tokens from the long-lived-user-token exchange are the
  most durable).
- **Claude API 401** — check `ANTHROPIC_API_KEY` is set correctly as a
  repo *Secret* (not Variable).
- **No image on posts** — either `UNSPLASH_ACCESS_KEY` isn't set, or the
  trend's search returned nothing; the script falls back to a text-only
  post rather than failing the whole run.
- **Nothing posted, log says "no fresh, safe trend available"** — every
  current trend was either already posted or filtered as sensitive; this
  is normal on a slow day and the next scheduled run will try again.
