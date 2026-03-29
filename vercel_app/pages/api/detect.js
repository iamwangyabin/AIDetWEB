import { IncomingForm } from 'formidable';
import fs from 'fs';
import fetch from 'node-fetch';

// Disable the default body parser so that formidable can handle multipart
export const config = {
  api: {
    bodyParser: false,
  },
};

// This handler parses the incoming multipart/form-data request, extracts
// the uploaded file, and forwards it to the Modal web endpoint.  The
// URL of the Modal endpoint should be provided via the MODAL_DETECT_URL
// environment variable in your Vercel project.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }
  // Parse form data using formidable
  const form = new IncomingForm({ multiples: false });
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error(err);
      return res.status(500).end('Error parsing the uploaded file');
    }
    const file = files.file;
    if (!file) {
      return res.status(400).end('File not provided');
    }
    try {
      const modalUrl = process.env.MODAL_DETECT_URL;
      if (!modalUrl) {
        throw new Error('MODAL_DETECT_URL environment variable is not set');
      }
      // Read the uploaded file into a Buffer
      const fileBuffer = fs.readFileSync(file.filepath);
      // Forward the request to the Modal endpoint
      const response = await fetch(modalUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: fileBuffer,
      });
      if (!response.ok) {
        const text = await response.text();
        console.error('Modal error:', response.status, text);
        return res
          .status(502)
          .end(`Modal endpoint error: ${response.status} ${text}`);
      }
      const data = await response.json();
      return res.status(200).json(data);
    } catch (error) {
      console.error('Proxy error:', error);
      return res.status(500).end('Proxy error: ' + error.message);
    }
  });
}