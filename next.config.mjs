/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/interior-poc/api/generate": [
      "./public/products/**/*",
      "./public/catalogo/**/*",
    ],
  },
};

export default nextConfig;
