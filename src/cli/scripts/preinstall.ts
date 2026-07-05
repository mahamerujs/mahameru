#!/usr/bin/env node

// Check if the global flag is active
if (process.env.npm_config_global === 'true' || process.env.npm_config_global === '1') {
  console.error('\x1b[31m%s\x1b[0m', '==================================================');
  console.error('\x1b[31m%s\x1b[0m', ' Error: The "mahameru" package cannot be installed globally!');
  console.error('\x1b[31m%s\x1b[0m', ' Please install it locally within your project using:');
  console.error('\x1b[33m%s\x1b[0m', ' npm install mahameru');
  console.error('\x1b[31m%s\x1b[0m', '==================================================');
  
  // Exit with a non-zero error code to abort the npm installation process
  process.exit(1);
}
