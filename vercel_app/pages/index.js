import { useState } from 'react';

export default function Home() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      alert('Please select an image.');
      return;
    }
    setLoading(true);
    setResult(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/detect', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Request failed: ${res.status} ${text}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <main style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
      <h1>Deepfake Detector</h1>
      <p>Upload an image to detect if it is real or fake.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <br />
        <button type="submit" disabled={loading} style={{ marginTop: '1rem' }}>
          {loading ? 'Processing...' : 'Submit'}
        </button>
      </form>
      {result && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Result</h2>
          <p>
            Prediction: <strong>{result.label}</strong>
          </p>
          <p>
            Confidence: <strong>{(result.confidence * 100).toFixed(2)}%</strong>
          </p>
        </div>
      )}
    </main>
  );
}