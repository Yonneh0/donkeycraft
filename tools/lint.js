#!/usr/bin/env node

/**
 * lint.js - Lint JS/CSS files using ESLint and Stylelint.
 *
 * Fails the build on any warning or error (strict mode).
 * Falls back to basic syntax checks if linters are not installed.
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

// --- Recursively list files with extensions (same as format.js) ---
function listFiles(dir, extensions) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
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

function collectFiles() {
  const jsExt = new Set(['.js']);
  const cssExt = new Set(['.css']);
  const jsFiles = listFiles(path.join(PROJECT_ROOT, 'src'), jsExt);
  const cssFiles = listFiles(path.join(PROJECT_ROOT, 'src'), cssExt);
  return { jsFiles, cssFiles, all: [...jsFiles, ...cssFiles] };
}

// --- Check if a command is available ---
function commandExists(cmd) {
  try {
    const { execSync } = require('child_process');
    execSync(`${cmd} --version`, { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

// --- Basic JS syntax check using Node.js --check flag ---
function basicJsLint(files) {
  const { execSync } = require('child_process');
  const errors = [];
  const warnings = [];

  for (const file of files) {
    try {
      // Use Node's built-in --check flag which compiles without executing
      // This catches syntax errors without running the code
      execSync(`node --check "${file}"`, {
        cwd: PROJECT_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      // Check if it's a syntax error vs runtime error
      const output = (err.stdout || '') + (err.stderr || '');
      if (output.includes('SyntaxError') || output.includes('ERR_REQUIRE_ESM')) {
        errors.push({
          file: path.relative(PROJECT_ROOT, file),
          message: `Syntax error: ${output.split('\n')[0]}`,
        });
      }
      // Other errors (e.g., ERR_REQUIRE_NATIVE) are expected from IIFE modules
    }
  }

  return { success: errors.length === 0 ? true : false, errors, warnings, reason: errors.length > 0 ? 'syntax-errors' : undefined };
}

// --- Run ESLint on JS files ---
function runEslint(jsFiles, config) {
  const { execSync } = require('child_process');

  if (!commandExists('eslint')) {
    console.log('[lint] ESLint not installed — using basic syntax check');
    return basicJsLint(jsFiles);
  }

  console.log(`[lint] ESLint: ${jsFiles.length} JS files`);

  const eslintConfig = config.tools.eslint || {};
  const failOnWarning = eslintConfig.failOnWarning !== false; // default true
  const failOnError = eslintConfig.failOnError !== false; // default true

  let allErrors = [];
  let allWarnings = [];

  // Process in batches
  const batchSize = 50;
  for (let i = 0; i < jsFiles.length; i += batchSize) {
    const batch = jsFiles.slice(i, i + batchSize);
    const fileArgs = batch.map(f => `"${f}"`).join(' ');

    try {
      const result = execSync(`eslint --no-eslintrc --env browser --parser-options ecmaVersion:2020,sourceType:module ${fileArgs} 2>&1`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Parse ESLint output
      const lines = result.trim().split('\n').filter(l => l.trim());
      for (const line of lines) {
        // ESLint format: "path/to/file.js:10:5 - Message (severity)"
        const match = line.match(/^(\S+):(\d+):(\d+)\s+-\s+(.+)\s+\((\w+)\)$/);
        if (match) {
          const [, file, lineNum, col, message, severity] = match;
          const entry = { file: path.relative(PROJECT_ROOT, file), line: parseInt(lineNum), column: parseInt(col), message };
          if (severity === 'error') {
            allErrors.push(entry);
          } else {
            allWarnings.push(entry);
          }
        } else if (line.includes('✖') || line.includes('✓')) {
          // Summary line — skip
        } else if (line.trim()) {
          // Other output — might be a warning about config
          console.log(`[lint]   ${line}`);
        }
      }
    } catch (err) {
      // ESLint returns non-zero on issues
      const output = err.stdout || err.stderr || '';
      const lines = output.trim().split('\n').filter(l => l.trim());

      for (const line of lines) {
        const match = line.match(/^(\S+):(\d+):(\d+)\s+-\s+(.+)\s+\((\w+)\)$/);
        if (match) {
          const [, file, lineNum, col, message, severity] = match;
          const entry = { file: path.relative(PROJECT_ROOT, file), line: parseInt(lineNum), column: parseInt(col), message };
          if (severity === 'error') {
            allErrors.push(entry);
          } else {
            allWarnings.push(entry);
          }
        }
      }
    }
  }

  // Report
  if (allWarnings.length > 0) {
    console.log(`[lint]   ${allWarnings.length} warning(s):`);
    for (const w of allWarnings) {
      console.log(`  ⚠ ${w.file}:${w.line} — ${w.message}`);
    }
  }

  if (allErrors.length > 0) {
    console.log(`[lint]   ${allErrors.length} error(s):`);
    for (const e of allErrors) {
      console.log(`  ✗ ${e.file}:${e.line} — ${e.message}`);
    }
  }

  // Fail if configured to
  if (failOnWarning && allWarnings.length > 0) {
    return { success: false, reason: 'lint-warnings', errors: allErrors, warnings: allWarnings };
  }
  if (failOnError && allErrors.length > 0) {
    return { success: false, reason: 'lint-errors', errors: allErrors, warnings: allWarnings };
  }

  console.log(`[lint]   ✓ No issues found`);
  return { success: true, errors: allErrors, warnings: allWarnings };
}

// --- Run Stylelint on CSS files ---
function runStylelint(cssFiles, config) {
  const { execSync } = require('child_process');

  if (!commandExists('stylelint')) {
    console.log('[lint] Stylelint not installed — skipping CSS lint');
    return { success: true, errors: [], warnings: [] };
  }

  console.log(`[lint] Stylelint: ${cssFiles.length} CSS files`);

  const stylelintConfig = config.tools.stylelint || {};
  const failOnWarning = stylelintConfig.failOnWarning !== false;
  const failOnError = stylelintConfig.failOnError !== false;

  let allErrors = [];
  let allWarnings = [];

  // Process in batches
  const batchSize = 50;
  for (let i = 0; i < cssFiles.length; i += batchSize) {
    const batch = cssFiles.slice(i, i + batchSize);
    const fileArgs = batch.map(f => `"${f}"`).join(' ');

    try {
      execSync(`stylelint ${fileArgs} --config '{"extends":"stylelint-config-standard"}'`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      const output = err.stdout || err.stderr || '';
      const lines = output.trim().split('\n').filter(l => l.trim());

      for (const line of lines) {
        // Stylelint format: "path/to/file.css:10:5 — Expected something (rule)"
        const match = line.match(/^(\S+):(\d+):(\d+)\s*—\s+(.+)$/);
        if (match) {
          const [, file, lineNum, col, message] = match;
          const entry = { file: path.relative(PROJECT_ROOT, file), line: parseInt(lineNum), column: parseInt(col), message };
          allWarnings.push(entry); // Stylelint doesn't distinguish error/warning in output format
        }
      }
    }
  }

  if (allWarnings.length > 0) {
    console.log(`[lint]   ${allWarnings.length} issue(s):`);
    for (const w of allWarnings) {
      console.log(`  ⚠ ${w.file}:${w.line} — ${w.message}`);
    }
  }

  if (failOnWarning && allWarnings.length > 0) {
    return { success: false, reason: 'stylelint-issues', errors: allErrors, warnings: allWarnings };
  }

  console.log(`[lint]   ✓ No issues found`);
  return { success: true, errors: [], warnings: allWarnings };
}

// --- Main lint function ---
function run() {
  const config = loadConfig();
  const { jsFiles, cssFiles } = collectFiles();

  if (jsFiles.length === 0 && cssFiles.length === 0) {
    console.log('[lint] No source files found in src/');
    return { success: false, reason: 'no-sources' };
  }

  console.log(`[lint] Found ${jsFiles.length + cssFiles.length} files (${jsFiles.length} JS + ${cssFiles.length} CSS)`);

  // Run JS linting
  const jsResult = runEslint(jsFiles, config);
  if (!jsResult.success) {
    return jsResult;
  }

  // Run CSS linting
  const cssResult = runStylelint(cssFiles, config);
  if (!cssResult.success) {
    return cssResult;
  }

  console.log('[lint] ✓ All lint checks passed');
  return { success: true };
}

module.exports = { run, collectFiles, runEslint, runStylelint, basicJsLint, commandExists };

// Run if executed directly
if (require.main === module) {
  const result = run();
  if (!result.success) {
    console.log(`[lint] Build failed: ${result.reason}`);
    process.exit(1);
  }
}