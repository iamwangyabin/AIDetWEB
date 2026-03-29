/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // To allow uploading files, we need to disable the built‑in body
  // parser for API routes that handle file uploads.
  api: {
    bodyParser: false,
  },
};

module.exports = nextConfig;