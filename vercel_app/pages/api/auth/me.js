import { getRequestViewer } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  const viewer = await getRequestViewer(req, res);

  return res.status(200).json({
    user: viewer.kind === 'user'
      ? {
          id: viewer.id,
          email: viewer.email,
          status: viewer.status,
          quota: viewer.quota,
        }
      : null,
    viewer,
  });
}
