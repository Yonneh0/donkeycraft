#!/usr/bin/env node

/**
 * format.js - Auto-format and validate JS/CSS files using Prettier.
 *
 * Uses Prettier's Node.js API directly (no shell commands) for cross-platform compatibility.
 * Runs in check mode first to detect unformatted files, then applies --write to fix them.
 */

const fs = require('fs');
const path = require('path');

// --- Resolve paths ---
const TOOLS_DIR = __dirname;
const PROJECT_ROOT = path.join(TOOLS_DIR, '..');

// --- Load project config ---
function loadConfig() {
  const configPath = path.join(TOOLS_DIR, 'project.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// --- Recursively list files in directory with extensions ---
function listFiles(dir, extensions) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules, .git, build, ref directories
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'build' || entry.name === 'ref') {
          continue;
        }
        results.push(...listFiles(fullPath, extensions));
      } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    // Skip directories we can't read
  }
  return results;
}

// --- Collect source files ---
function collectFiles(config) {
  const jsExt = new Set(['.js']);
  const cssExt = new Set(['.css']);

  const jsFiles = listFiles(path.join(PROJECT_ROOT, 'src'), jsExt);
  const cssFiles = listFiles(path.join(PROJECT_ROOT, 'src'), cssExt);

  return { jsFiles, cssFiles, all: [...jsFiles, ...cssFiles] };
}

// --- Build Prettier options object from config ---
function buildPrettierOptions(config) {
  const opts = config.tools.prettier || {};

  // Map config keys to Prettier API options
  const apiMap = {
    tabWidth: 'tabWidth',
    semi: 'semi',
    singleQuote: 'singleQuote',
    trailingComma: 'trailingComma',
    bracketSpacing: 'bracketSpacing',
    arrowParens: 'arrowParens',
    endOfLine: 'endOfLine',
    printWidth: 'printWidth',
    proseWrap: 'proseWrap',
    quoteProps: 'quoteProps',
    bracketSameLine: 'bracketSameLine',
    jsxSingleQuote: 'jsxSingleQuote',
    htmlWhitespaceSensitivity: 'htmlWhitespaceSensitivity',
    parser: 'parser',
  };

  const options = {
    // Default fallback values
    tabWidth: 2,
    semi: true,
    singleQuote: false,
    trailingComma: 'es5',
    bracketSpacing: true,
    arrowParens: 'always',
    endOfLine: 'lf',
    printWidth: 80,
  };

  for (const [key, apiKey] of Object.entries(apiMap)) {
    if (opts[key] !== undefined) {
      options[apiKey] = opts[key];
    }
  }

  return options;
}

const prettier = require('prettier');

// --- Determine Prettier parser from file extension ---
function getParserFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.js') return 'babel';
  if (ext === '.css') return 'css';
  return null;
}

// --- Check formatting of a single file using Prettier API ---
async function checkFile(filePath, prettierOptions) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const formatted = await prettier.format(content, {
      ...prettierOptions,
      filepath: filePath,
    });
    return content === formatted;
  } catch (err) {
    console.error(`[format] Error checking ${path.relative(PROJECT_ROOT, filePath)}: ${err.message}`);
    return false;
  }
}

// --- Format a single file using Prettier API ---
async function formatFile(filePath, prettierOptions) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const formatted = await prettier.format(content, {
      ...prettierOptions,
      filepath: filePath,
    });
    fs.writeFileSync(filePath, formatted, 'utf8');
    return true;
  } catch (err) {
    console.error(`[format] Error formatting ${path.relative(PROJECT_ROOT, filePath)}: ${err.message}`);
    return false;
  }
}

// --- Check formatting of all files ---
async function checkFormat(allFiles, prettierOptions) {
  console.log(`[format] Checking ${allFiles.length} files for formatting issues...`);

  const unformatted = [];

  for (const file of allFiles) {
    if (!(await checkFile(file, prettierOptions))) {
      unformatted.push(file);
    }
  }

  return { unformatted };
}

// --- Format all files ---
async function writeFormat(allFiles, prettierOptions) {
  console.log(`[format] Writing ${allFiles.length} files...`);

  const formatted = [];
  let anyError = false;

  for (const file of allFiles) {
    if (await formatFile(file, prettierOptions)) {
      formatted.push(file);
    } else {
      anyError = true;
    }
  }

  return { formatted, anyError };
}

// --- Main format function ---
async function format(allFiles, prettierOptions) {
  if (allFiles.length === 0) {
    console.log('[format] No files to format');
    return { success: false, reason: 'no-files' };
  }

  const { unformatted } = await checkFormat(allFiles, prettierOptions);

  if (unformatted.length === 0) {
    console.log('[format] ✓ All files formatted correctly');
    return { success: true, formatted: [], total: allFiles.length, reformatCount: 0 };
  }

  console.log(`[format] ${unformatted.length} file(s) need formatting:`);
  for (const f of unformatted) {
    const relPath = path.relative(PROJECT_ROOT, f);
    console.log(`  ✗ ${relPath}`);
  }
  console.log('');

  // Auto-format all files
  console.log('[format] Auto-applying formatting...');
  const { formatted, anyError: writeError } = await writeFormat(allFiles, prettierOptions);

  if (writeError) {
    return { success: false, reason: 'format-write-error' };
  }

  // Verify re-formatting on formatted files only
  const { unformatted: stillUnformatted } = await checkFormat(formatted, prettierOptions);
  if (stillUnformatted.length > 0) {
    console.error('[format] ✗ Re-format verification failed');
    return { success: false, reason: 'verification-failed' };
  }

  console.log(`[format] ✓ Formatted ${formatted.length} file(s)`);
  return { success: true, formatted, total: allFiles.length, reformatCount: formatted.length };
}

// --- Main entry point ---
async function run() {
  const config = loadConfig();
  const { jsFiles, cssFiles, all } = collectFiles(config);

  if (all.length === 0) {
    console.log('[format] No source files found in src/');
    return { success: false, reason: 'no-sources' };
  }

  console.log(`[format] Found ${all.length} files (${jsFiles.length} JS + ${cssFiles.length} CSS)`);

  const prettierOptions = buildPrettierOptions(config);
  const result = await format(all, prettierOptions);
  return result;
}

module.exports = { run, collectFiles, format, checkFormat, writeFormat, buildPrettierOptions };

// Run if executed directly
if (require.main === module) {
  run().then(result => {
    if (!result.success) {
      process.exit(1);
    }
  }).catch(err => {
    console.error('[format] Fatal error:', err);
    process.exit(2);
  });
}
