/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/interior-poc/api/generate": ["./public/products/**/*"],
  },
};

export default nextConfig;
