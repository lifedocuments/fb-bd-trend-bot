# Facebook BD-Trend Bot

Posts short, AI-written (Google Gemini by default, Claude optional) text+image Facebook posts about what's trending
in Bangladesh right now, and keeps your Page's About text fresh — fully
automated via GitHub Actions, no server to run or pay for.

## How it works

1. A GitHub Actions workflow wakes up at 6 candidate times a day (09, 12,
   14, 17, 19, 21 Bangladesh time). A planner (smart timing) picks the 3
   that perform best for your Page and posts only in those.
2. It fetches Google's "Daily Trending Searches" feed for Bangladesh (free,
   no API key).
3. It filters out anything that looks like a death, disaster, crime, or
   political flashpoint — see "Safety" below.
4. It picks the first trend you haven't posted about before, and asks the AI
   (Gemini, free tier) to check it suits the Page's audience (Bangladeshi
   adults 20-50 by default; skips foreign-only, political, adult or
   tragic topics), then to write a short Facebook caption about it (Bangla by default).
5. It finds an image on Unsplash (free stock photos) using a general search
   phrase the AI suggests, and adds the photographer credit to the caption.
6. It posts the photo + caption to your Facebook Page via the Graph API —
   **as a draft in Meta Business Suite → Content → Drafts by default**, so
   nothing goes live until you've
   reviewed it (see "Going fully live" below).
7. A second, weekly workflow asks the AI to refresh your Page's About text
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
2. A **Google Gemini API key** (free tier; writes the posts). An Anthropic
   API key is optional and only needed if you'd rather pay for Claude.
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

### 2. Get a Google Gemini API key (free)

1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key** (accept the terms; create a new project if asked).
3. Copy the key — it usually starts with `AIza`.

No card is needed for the free tier, which easily covers 2 posts a day.
Things to know: on the free tier Google may use your prompts/outputs to
improve its products (fine for public trend posts — don't send private
data), the free tier has daily rate limits, and you should check Google's
Gemini API terms if the Page is a commercial/business Page.

The bot uses Google's `gemini-flash-latest` alias by default. To pin a
specific model, add a `GEMINI_MODEL` repository variable.

**Optional — Claude instead (paid):** create a key at
https://console.anthropic.com/settings/keys, add it as the
`ANTHROPIC_API_KEY` secret, and either remove `GEMINI_API_KEY` or set the
`LLM_PROVIDER` variable to `claude`. `CLAUDE_MODEL` overrides the model.

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
- `GEMINI_API_KEY`
- `FB_PAGE_ID`
- `FB_PAGE_ACCESS_TOKEN`
- `UNSPLASH_ACCESS_KEY`

Under the **Variables** tab, add these (not secret, just settings):
- `PAGE_NAME` — your Page's name, e.g. `BD Viral Buzz`
- `POST_LANGUAGE` — `bn` (Bangla), `en` (English), or `banglish`
- `AUTO_PUBLISH` — leave unset or `false` to start (drafts only); set to
  `true` once you've reviewed a few drafts and trust the output
- Optional: `TARGET_AUDIENCE` (default `Bangladeshi adults aged 20-50`),
  `BRAND_HASHTAG` (default `#SakinMartBD`, added to every post),
  `EVERGREEN_FALLBACK` (`false` to turn off evergreen posts on slow days —
  edit the topic list in `scripts/lib/evergreen.js`),
  `NEWS_LINK_COMMENT` (`false` to stop adding the news-article link as the
  first comment on live trend posts),
  `PHOTOCARDS` (`false` to post plain photos instead of branded Bangla
  photocards), `SPECIAL_DAYS` (`false` to skip special-day posts — edit
  `scripts/lib/special-days.js`, and add Eid/Puja dates there once they are
  officially announced),
  `GEMINI_MODEL`, `LLM_PROVIDER` (`gemini` or `claude`),
  `CLAUDE_MODEL`, `ALLOW_TREND_PICTURES` (`true` to also use Google
  Trends' own news pictures — off by default because those photos usually
  belong to news publishers)

## Testing before anything goes near your real Page

**Step 1 — no credentials needed at all.** From your repo's **Actions**
tab, open "Post a BD trend to Facebook" → **Run workflow** → tick
**dry_run** → **Run workflow**. This fetches real trends, runs the
sensitive-topic filter, and prints what it *would* post — no AI,
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
  crime, or unrest before they ever reach the AI. The AI is separately
  instructed to refuse the same categories on its own (and Gemini's own
  safety filter blocks are treated as a skip). Neither is perfect —
  keyword filters miss things worded unusually, and the AI can occasionally
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

## Breaking trends

`.github/workflows/breaking.yml` checks every hour (08:30-23:30 Bangladesh
time) for a topic that has suddenly reached 100K+ searches and posts it
right away with an "এখন ট্রেন্ডিং" label. Limits: at most 2 breaking posts a
day, at least 60 minutes after the previous post, topics from the last 6
hours only, and the daily sports limit still applies. Hours with nothing
new finish in seconds. Both posting workflows share a lock, so they never
post at the same moment. Variables: `BREAKING_POSTS=false` to turn off,
`BREAKING_MIN_SEARCHES` (default 100000), `BREAKING_MAX_PER_DAY` (2),
`BREAKING_MIN_GAP_MINUTES` (60), `BREAKING_MAX_AGE_HOURS` (6).

## Facebook Stories

Every live post is also shared to the Page Story as a 9:16 card with a
"বিস্তারিত দেখুন আমাদের পেজে" note (Stories show at the top of followers'
feeds for 24 hours). A failed Story never affects the post. `STORIES=false`
turns it off.

## Weekly health check

`.github/workflows/health.yml` runs every Monday 10:00 Bangladesh time (or
manually: Actions -> Weekly health check -> Run workflow). It checks that
the Facebook Page token still works, that posts went out recently (last
post within 36h, at least 7 in the week), and that the Gemini and Unsplash
keys are accepted. If something critical is wrong the run fails and GitHub
emails you; the run's Summary page shows a table plus last week's posts by
category and format. Variables: `HEALTH_MIN_POSTS`, `HEALTH_MAX_HOURS`.

## Topic variety

Google Trends in Bangladesh is mostly cricket, so the bot also reads Google
News Bangladesh's Entertainment, Technology and Business sections (in
Bangla), sorts every topic into a category, and then: allows at most 1
sports post a day, avoids the same category twice in a row, and prefers the
category posted least today. Variables: `MAX_SPORTS_PER_DAY` (default 1),
`TOPIC_FEEDS` (default `ENTERTAINMENT,TECHNOLOGY,BUSINESS`; also `SCIENCE`,
`WORLD`; `none` to use Google Trends only).

## Smart timing

Every post records its time slot and Facebook post id. Once a day the
planner reads reactions, comments and shares of the last 30 days' posts
(score = reactions + 2x comments + 3x shares) and picks today's slots: the
best ones so far plus one slot it keeps testing, so it adapts as your
audience changes. The first week or so it rotates through every slot to
collect data. Today's plan is saved in `data/schedule.json`.
Variables: `SMART_TIMING=false` (fixed 09/14/21), `POSTS_PER_DAY` (1-6,
default 3).

## Reels

Once a day — in the best-performing slot — the post goes out as an 8-second
vertical Reel instead of a photo: slow zoom on the photo, Bangla headline
fading in, silent audio track (no music, so no copyright problems). If the
Reel can't be built or Facebook rejects it, the photocard is posted instead.
To test right away: Actions -> Run workflow -> tick "Post this one as a Reel".
Variables: `REELS=false` to turn off, `REEL_SECONDS` (default 8).

## News-link comments

On live trend posts, the bot adds the news article's link (from Google
Trends) as the first comment and adds "👇 বিস্তারিত খবরের লিংক কমেন্টে" to
the caption. Links inside the post itself tend to get less reach, so the
link goes in the comment. This needs the `pages_manage_engagement`
permission on your Page token — generate the token with that permission
too (Graph API Explorer), then update the `FB_PAGE_ACCESS_TOKEN` secret.
If the permission is missing the post still goes out; only the comment is
skipped, with a warning in the log.

## Troubleshooting

- **"Error validating access token" / permission errors** — your Page
  token expired or was generated without the right permissions. Redo
  step 1 above (tokens from the long-lived-user-token exchange are the
  most durable).
- **Gemini API 400/403** — check `GEMINI_API_KEY` is set correctly as a
  repo *Secret* (not Variable). If it mentions the model, set a
  `GEMINI_MODEL` variable to a current free Flash model from Google's
  pricing page.
- **Gemini HTTP 429** — the free tier's daily limit was hit; it resets
  daily and the next scheduled run will try again.
- **Claude API 401** (only if using Claude) — check `ANTHROPIC_API_KEY`.
- **No image on posts** — either `UNSPLASH_ACCESS_KEY` isn't set, or the
  trend's search returned nothing; the script falls back to a text-only
  post rather than failing the whole run.
- **Nothing posted, log says "no fresh, safe trend available"** — every
  current trend was either already posted or filtered as sensitive; this
  is normal on a slow day and the next scheduled run will try again.
