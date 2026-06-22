import { readFileSync, writeFileSync } from 'fs';

const targetVersion = process.env.npm_package_version;

// Read minAppVersion from manifest.json and bump version to target version
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

// Read versions.json and bump version to target version
let versions = {};
try {
  versions = JSON.parse(readFileSync('versions.json', 'utf8'));
} catch (e) {
  // If versions.json doesn't exist, initialize
}
versions[targetVersion] = minAppVersion;
writeFileSync('versions.json', JSON.stringify(versions, null, 2) + '\n');
