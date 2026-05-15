const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// Watch the shared package for workspace imports
config.watchFolders = [
  path.resolve(workspaceRoot, "shared"),
];

// Resolve modules from mobile's node_modules FIRST, then workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Force key packages to always resolve from mobile's node_modules
// This prevents the workspace root's React 19 / RN 0.84 from being bundled
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, "node_modules", "react"),
  "react-native": path.resolve(projectRoot, "node_modules", "react-native"),
};

// Block other workspace packages from being bundled
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.resolver.blockList = [
  new RegExp(escapeRegex(path.resolve(workspaceRoot, "web")) + "/.*"),
  new RegExp(escapeRegex(path.resolve(workspaceRoot, "server")) + "/.*"),
  // Block the hoisted react and react-native from the workspace root
  new RegExp(
    escapeRegex(path.resolve(workspaceRoot, "node_modules", "react")) + "/.*"
  ),
  new RegExp(
    escapeRegex(path.resolve(workspaceRoot, "node_modules", "react-native")) +
      "/.*"
  ),
];

module.exports = config;
