/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow CORS from the VS Code extension
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-Sentinel-Secret" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
