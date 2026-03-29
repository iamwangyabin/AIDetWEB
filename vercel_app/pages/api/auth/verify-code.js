import { setSessionCookie, verifyLoginCode } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const { email, code } = req.body || {};
  const result = await verifyLoginCode(email, code);

  if (!result.ok) {
    return res.status(result.status).json({ message: result.message });
  }

  setSessionCookie(res, result.sessionToken);

  return res.status(200).json({
    user: result.user,
    message: 'Login successful.',
  });
}
