/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // pdfkit laadt lettertype-/datafiles via require op runtime — niet bundelen.
    serverComponentsExternalPackages: ["pdfkit", "docx", "svg-to-pdfkit", "archiver", "exceljs"],
  },
};

export default nextConfig;
