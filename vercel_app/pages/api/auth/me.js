import { getSessionUser } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  const user = await getSessionUser(req);

  if (!user) {
    return res.status(200).json({ user: null });
  }

  return res.status(200).json({ user });
}
