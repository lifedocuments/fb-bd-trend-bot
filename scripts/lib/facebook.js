// Thin wrapper around the Facebook Graph API for a single Page you manage.
// Needs FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN in the environment.
//
// Required Page token permissions: pages_manage_posts, pages_read_engagement,
// and pages_manage_metadata (for the About/description update). See the
// README for how to generate a long-lived token with these.

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set.`);
  return v;
}

async function graphRequest(path, { method = 'GET', params = {} } = {}) {
  const token = requireEnv('FB_PAGE_ACCESS_TOKEN');
  const url = new URL(`${GRAPH_BASE}${path}`);
  const body = new URLSearchParams({ ...params, access_token: token });

  let res;
  if (method === 'GET') {
    for (const [k, v] of body) url.searchParams.set(k, v);
    res = await fetch(url.toString());
  } else {
    res = await fetch(url.toString(), { method, body });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg = data.error ? `${data.error.message} (code ${data.error.code}, type ${data.error.type})` : `HTTP ${res.status}`;
    throw new Error(`Facebook Graph API error on ${path}: ${msg}`);
  }
  return data;
}

// Posts a photo with a caption in one call. `published: false` creates an
// unpublished (draft) Page post that sits in Meta Business Suite's "Drafts"
// for a human to review and publish — this is the default AUTO_PUBLISH=false
// behavior so nothing goes live unattended until you've checked the quality
// and trust the pipeline.
export async function postPhotoToPage({ pageId, imageUrl, caption, publish }) {
  return graphRequest(`/${pageId}/photos`, {
    method: 'POST',
    params: {
      url: imageUrl,
      caption,
      published: String(!!publish)
    }
  });
}

// Text-only fallback when no image could be found for the trend.
export async function postTextToPage({ pageId, message, publish }) {
  return graphRequest(`/${pageId}/feed`, {
    method: 'POST',
    params: {
      message,
      published: String(!!publish)
    }
  });
}

export async function updatePageAbout({ pageId, about }) {
  return graphRequest(`/${pageId}`, {
    method: 'POST',
    params: { about }
  });
}
