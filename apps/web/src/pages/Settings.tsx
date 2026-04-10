import { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api-client';

export function Settings() {
  const [newApiKey, setNewApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const testTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      if (testTimerRef.current) clearTimeout(testTimerRef.current);
    };
  }, []);

  const handleSave = () => {
    if (!newApiKey.trim()) return;
    api.setApiKey(newApiKey.trim());
    setNewApiKey('');
    setSaved(true);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    try {
      await api.get('/projects');
      setTestResult({ ok: true, message: 'Connection successful!' });
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message });
    }
    testTimerRef.current = setTimeout(() => setTestResult(null), 3000);
  };

  const maskedKey = api.getMaskedKey();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Settings</h1>
      <p className="text-gray-400 mb-8">Configure your AI Content Writer</p>

      <div className="card max-w-2xl">
        <h2 className="text-lg font-semibold mb-4">API Connection</h2>

        <div className="space-y-4">
          {maskedKey && (
            <div className="text-sm text-gray-400">
              Current key: <code className="text-brand-400">{maskedKey}</code>
            </div>
          )}

          <div>
            <label className="label" htmlFor="api-key">New API Key</label>
            <input
              id="api-key"
              type="password"
              className="input"
              placeholder="Enter a new API key to replace current..."
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              This is the APP_API_KEY configured in your Cloudflare Worker secrets.
            </p>
          </div>

          <div className="flex gap-3">
            <button onClick={handleSave} className="btn-primary" disabled={!newApiKey.trim()}>
              {saved ? 'Saved!' : 'Save New Key'}
            </button>
            <button onClick={handleTest} className="btn-secondary">
              Test Connection
            </button>
          </div>

          {testResult && (
            <div className={`text-sm px-4 py-2 rounded-lg ${
              testResult.ok ? 'bg-brand-500/20 text-brand-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {testResult.message}
            </div>
          )}
        </div>
      </div>

      <div className="card max-w-2xl mt-6">
        <h2 className="text-lg font-semibold mb-4">API Services</h2>
        <div className="space-y-3 text-sm">
          {[
            'Firecrawl', 'Google NLP', 'Google Search Console',
            'Serper', 'DataForSEO', 'NeuronWriter', 'Claude AI',
          ].map((service) => (
            <div key={service} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <span className="text-gray-300">{service}</span>
              <span className="text-gray-500 text-xs">Configured in Worker secrets</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
