const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

function obfuscateFile(filePath) {
    if (fs.statSync(filePath).isDirectory()) {
        fs.readdirSync(filePath).forEach(file => {
            obfuscateFile(path.join(filePath, file));
        });
    } else if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
        const code = fs.readFileSync(filePath, 'utf8');
        const obfuscated = JavaScriptObfuscator.obfuscate(code, {
            compact: true,
            controlFlowFlattening: true,
            controlFlowFlatteningThreshold: 1,
            numbersToExpressions: true,
            simplify: true,
            stringArrayShuffle: true,
            splitStrings: true,
            stringArrayThreshold: 1,
            target: 'node'
        });
        fs.writeFileSync(filePath, obfuscated.getObfuscatedCode());
        console.log(`Obfuscated: ${filePath}`);
    }
}

try {
    const targetDir = path.join(__dirname, '../build/electron');
    if (fs.existsSync(targetDir)) {
        console.log('Starting obfuscation for V8 level protection...');
        obfuscateFile(targetDir);
        console.log('Obfuscation complete.');
    } else {
        console.log(`Directory not found: ${targetDir}`);
    }
} catch (e) {
    console.error('Error during obfuscation:', e);
    process.exit(1);
}
