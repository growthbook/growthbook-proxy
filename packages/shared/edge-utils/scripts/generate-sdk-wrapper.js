const fs = require('fs');

// Read the vendor .js file
const vendorScriptPath = './node_modules/@growthbook/growthbook/dist/bundles/auto.min.js';
const vendorScriptContent = fs.readFileSync(vendorScriptPath, 'utf8')
  .replace(/\\/g, '\\\\') // Escape backslashes
  .replace(/'/g, "\\'")    // Escape single quotes
  .replace(/"/g, '\\"')    // Escape double quotes
  .replace(/\n/g, '\\n');  // Escape newlines

// Generate TypeScript file with embedded content
const outputFile = './src/generated/sdkWrapper.ts';
fs.writeFileSync(outputFile, `
export const sdkWrapper = "${vendorScriptContent}";
`);

console.log('Vendor script file generated successfully.');
