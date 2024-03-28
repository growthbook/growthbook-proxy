const fs = require('fs');

// Read the vendor .js file
const vendorScriptPath = './node_modules/@growthbook/growthbook/dist/bundles/auto.js';
const vendorScriptContent = fs.readFileSync(vendorScriptPath, 'utf8')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${');

// Generate TypeScript file with embedded content
const outputFile = './src/sdkWrapper.ts';
fs.writeFileSync(outputFile, `
export const sdkWrapper = \`${vendorScriptContent}\`;
`);

console.log('Vendor script file generated successfully.');
