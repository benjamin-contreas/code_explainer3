import { google, type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { streamText } from 'ai';
import express, { type Request, type Response } from 'express';

const MAX_FILE_BYTES = 100 * 1024;
const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

interface ExplainCodeInput {
  readonly code: string;
  readonly language: string;
}

interface ExplainRequest {
  readonly url: string;
  readonly language: string;
}

export async function* streamCodeExplanation({
  code,
  language,
}: ExplainCodeInput): AsyncGenerator<string> {
  const { fullStream } = streamText({
    model: google('gemini-3.6-flash'),
    prompt: `Explain this code...\nRespond in ${language}.\n\n${code}`,
    providerOptions: {
      google: {
        thinkingConfig: { thinkingLevel: 'minimal' },
      } satisfies GoogleLanguageModelOptions,
    },
  });

  for await (const part of fullStream) {
    if (part.type === 'text-delta') yield part.text;
    if (part.type === 'error') throw part.error;
  }
}

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

app.post(
  '/api/explain',
  async (request: Request, response: Response): Promise<void> => {
    const body: unknown = request.body;

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      response.status(400).json({ error: 'url and language are required' });
      return;
    }

    const { url, language } = body as Record<string, unknown>;
    if (
      typeof url !== 'string' ||
      url.trim() === '' ||
      typeof language !== 'string' ||
      language.trim() === ''
    ) {
      response.status(400).json({ error: 'url and language are required' });
      return;
    }

    const input: ExplainRequest = {
      url: url.trim(),
      language: language.trim(),
    };

    try {
      const code = await fetchPublicGitHubFile(input.url);
      const explanation = streamCodeExplanation({
        code,
        language: input.language,
      });

      response.type('text/plain');
      for await (const chunk of explanation) response.write(chunk);
      response.end();
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }

      response.removeHeader('Content-Type');
      const message = error instanceof Error ? error.message : '';
      if (message === 'Invalid public GitHub file URL') {
        response.status(400).json({ error: message });
      } else if (message === 'GitHub returned 404') {
        response.status(404).json({ error: 'GitHub file not found' });
      } else if (message === 'GitHub file exceeds 100 KiB limit') {
        response.status(413).json({ error: message });
      } else {
        response.status(502).json({ error: 'Unable to explain code' });
      }
    }
  },
);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
