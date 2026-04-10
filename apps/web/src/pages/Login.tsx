import { useState, type FormEvent } from 'react';
import { api } from '../lib/api-client';

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError('');

    api.setApiKey(apiKey);

    try {
      await api.get('/projects');
      onLogin();
    } catch (err) {
      setError('Invalid API key. Check your Worker secrets.');
      api.clearApiKey();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="card w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-400">AI Writer</h1>
          <p className="text-gray-500 mt-2">SEO Content Engine</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="login-key">API Key</label>
            <input
              id="login-key"
              type="password"
              className="input"
              placeholder="Enter your API key..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              autoFocus
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 px-4 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading || !apiKey}
          >
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  );
}
