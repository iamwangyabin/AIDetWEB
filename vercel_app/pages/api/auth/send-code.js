import { sendLoginCode } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const { email } = req.body || {};
  const result = await sendLoginCode(email);

  if (!result.ok) {
    return res.status(result.status).json({ message: result.message });
  }

  return res.status(200).json({
    message: result.message,
    demoCode: result.demoCode,
    expiresInSeconds: result.expiresInSeconds,
  });
}
