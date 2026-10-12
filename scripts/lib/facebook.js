// Thin wrapper around the Facebook Graph API for a single Page you manage.
// Needs FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN in the environment.
//
// Required Page token permissions: pages_manage_posts, pages_read_engagement,
// pages_manage_engagement (news-link comments), and pages_manage_metadata (for the About/description update). See the
// README for how to generate a long-lived token with these.

import { readFile, stat } from 'node:fs/promises';

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

  return parseGraphResponse(res, path);
}

async function parseGraphResponse(res, path) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg = data.error ? `${data.error.message} (code ${data.error.code}, type ${data.error.type})` : `HTTP ${res.status}`;
    throw new Error(`Facebook Graph API error on ${path}: ${msg}`);
  }
  return data;
}

// Uploads a local image file (multipart "source" field) instead of a URL.
async function graphUpload(path, params, filePath) {
  const token = requireEnv('FB_PAGE_ACCESS_TOKEN');
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  form.append('access_token', token);
  const buf = await readFile(filePath);
  form.append('source', new Blob([buf], { type: 'image/png' }), 'photocard.png');
  const res = await fetch(`${GRAPH_BASE}${path}`, { method: 'POST', body: form });
  return parseGraphResponse(res, path);
}

// Posts a photo + caption.
//
// publish=true  -> one call to /photos, goes live immediately.
// publish=false -> a real Meta Business Suite DRAFT (shows in Content ->
//   Drafts, where you can preview, edit and publish it). This takes two
//   calls: upload the photo without publishing it, then create an
//   unpublished feed post of type DRAFT with that photo attached. (A plain
//   /photos call with published=false only creates a hidden photo that
//   never appears in the Drafts tab.)
export async function postPhotoToPage({ pageId, imageUrl, filePath, caption, publish }) {
  const upload = (params) => filePath
    ? graphUpload(`/${pageId}/photos`, params, filePath)
    : graphRequest(`/${pageId}/photos`, { method: 'POST', params: { url: imageUrl, ...params } });

  if (publish) {
    return upload({ caption, published: 'true' });
  }
  const photo = await upload({ published: 'false', temporary: 'true' });
  if (!photo.id) throw new Error('Facebook did not return an id for the uploaded photo.');
  return graphRequest(`/${pageId}/feed`, {
    method: 'POST',
    params: {
      message: caption,
      'attached_media[0]': JSON.stringify({ media_fbid: photo.id }),
      published: 'false',
      unpublished_content_type: 'DRAFT'
    }
  });
}

// Publishes a short vertical video as a Page Reel (3 steps: start an upload
// session, send the bytes, finish with the caption). publish=false saves it
// as a draft. Needs pages_manage_posts + pages_read_engagement.
export async function postReelToPage({ pageId, filePath, description, publish }) {
  const start = await graphRequest(`/${pageId}/video_reels`, { method: 'POST', params: { upload_phase: 'start' } });
  if (!start.video_id) throw new Error('Facebook did not start a Reel upload session.');
  const uploadUrl = start.upload_url || `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}/${start.video_id}`;
  const size = (await stat(filePath)).size;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${requireEnv('FB_PAGE_ACCESS_TOKEN')}`,
      offset: '0',
      file_size: String(size),
      'Content-Type': 'application/octet-stream'
    },
    body: await readFile(filePath)
  });
  const up = await res.json().catch(() => ({}));
  if (!res.ok || up.success === false || up.error) {
    throw new Error(`Reel upload failed: ${up.error?.message || 'HTTP ' + res.status}`);
  }
  const fin = await graphRequest(`/${pageId}/video_reels`, {
    method: 'POST',
    params: {
      upload_phase: 'finish',
      video_id: start.video_id,
      video_state: publish ? 'PUBLISHED' : 'DRAFT',
      description
    }
  });
  return { ...fin, id: start.video_id, video_id: start.video_id };
}

// Posts an image as a Page Story (visible 24h at the top of the feed):
// upload the photo unpublished, then publish it as a photo story.
export async function postStoryToPage({ pageId, filePath }) {
  const photo = await graphUpload(`/${pageId}/photos`, { published: 'false' }, filePath);
  if (!photo.id) throw new Error('Facebook did not return an id for the Story photo.');
  return graphRequest(`/${pageId}/photo_stories`, { method: 'POST', params: { photo_id: photo.id } });
}

// Reads reactions/comments/shares for our own posts (batched, 50 per call).
// Returns { [id]: { reactions, comments, shares } }; missing ids are skipped.
export async function fetchEngagement(ids, { includeShares = true } = {}) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const fields = ['reactions.summary(total_count).limit(0)', 'comments.summary(total_count).limit(0)'];
    if (includeShares) fields.push('shares');
    const data = await graphRequest('/', { params: { ids: batch.join(','), fields: fields.join(',') } });
    for (const [id, v] of Object.entries(data)) {
      out[id] = {
        reactions: v.reactions?.summary?.total_count || 0,
        comments: v.comments?.summary?.total_count || 0,
        shares: v.shares?.count || 0
      };
    }
  }
  return out;
}

// Adds a comment as the Page under a published post (needs the
// pages_manage_engagement permission on the Page token).
export async function commentOnPost({ objectId, message }) {
  return graphRequest(`/${objectId}/comments`, { method: 'POST', params: { message } });
}

// Text-only fallback when no image could be found for the trend.
export async function postTextToPage({ pageId, message, publish }) {
  const params = { message, published: String(!!publish) };
  if (!publish) params.unpublished_content_type = 'DRAFT';
  return graphRequest(`/${pageId}/feed`, { method: 'POST', params });
}

export async function updatePageAbout({ pageId, about }) {
  return graphRequest(`/${pageId}`, {
    method: 'POST',
    params: { about }
  });
}
