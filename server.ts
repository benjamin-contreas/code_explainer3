import express from 'express';

const MAX_FILE_BYTES = 100 * 1024;
const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

export async function fetchPublicGitHubFile(url: string): Promise<string> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Invalid public GitHub file URL');
  }

  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname !== 'github.com' ||
    parsedUrl.username !== '' ||
    parsedUrl.password !== '' ||
    pathParts.length < 5 ||
    pathParts[2] !== 'blob'
  ) {
    throw new Error('Invalid public GitHub file URL');
  }

  parsedUrl.pathname = parsedUrl.pathname.replace('/blob/', '/raw/');
  parsedUrl.search = '';
  parsedUrl.hash = '';

  const response = await fetch(parsedUrl, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}`);
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES) {
    await response.body?.cancel();
    throw new Error('GitHub file exceeds 100 KiB limit');
  }

  if (!response.body) {
    throw new Error('GitHub returned an empty response');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let code = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    byteCount += value.byteLength;
    if (byteCount > MAX_FILE_BYTES) {
      await reader.cancel();
      throw new Error('GitHub file exceeds 100 KiB limit');
    }

    code += decoder.decode(value, { stream: true });
  }

  return code + decoder.decode();
}

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
