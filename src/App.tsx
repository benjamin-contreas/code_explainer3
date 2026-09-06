import { useState, type FormEvent } from 'react';

type Status = 'idle' | 'loading' | 'success' | 'error';

export function App() {
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('English');
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus('loading');
    setExplanation('');
    setError('');

    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, language }),
      });

      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      if (!response.body) throw new Error('Response body unavailable');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        setExplanation((current) =>
          current + decoder.decode(value, { stream: true }),
        );
      }

      setExplanation((current) => current + decoder.decode());
      setStatus('success');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Request failed',
      );
      setStatus('error');
    }
  }

  const isLoading = status === 'loading';

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight">Code Explainer</h1>
        <p className="mt-3 text-slate-400">
          Paste a public GitHub file URL and choose the explanation language.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium" htmlFor="url">
              GitHub file URL
            </label>
            <input
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-blue-500"
              id="url"
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://github.com/owner/repo/blob/main/file.ts"
              required
              type="url"
              value={url}
            />
          </div>

          <div>
            <label className="block text-sm font-medium" htmlFor="language">
              Explanation language
            </label>
            <input
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-blue-500"
              id="language"
              onChange={(event) => setLanguage(event.target.value)}
              required
              type="text"
              value={language}
            />
          </div>

          <button
            className="rounded-lg bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
            type="submit"
          >
            {isLoading ? 'Explaining…' : 'Explain code'}
          </button>
        </form>

        {isLoading && (
          <p className="mt-8 text-slate-400" role="status">
            Generating explanation…
          </p>
        )}
        {error && (
          <p className="mt-8 text-red-400" role="alert">
            {error}
          </p>
        )}
        {explanation && (
          <pre className="mt-8 whitespace-pre-wrap rounded-lg bg-slate-900 p-6 font-sans leading-7">
            {explanation}
          </pre>
        )}
      </div>
    </main>
  );
}
