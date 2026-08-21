import type { NextConfig } from "next";

const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true" || process.env.VITE_GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const configuredBasePath = process.env.VITE_BASE_PATH?.replace(/\/$/, "");
const basePath = isGitHubPagesBuild
  ? configuredBasePath || (repositoryName ? `/${repositoryName}` : "")
  : "";

const nextConfig: NextConfig = isGitHubPagesBuild
  ? {
      output: "export",
      assetPrefix: basePath ? `${basePath}/` : undefined,
    }
  : {};

export default nextConfig;
