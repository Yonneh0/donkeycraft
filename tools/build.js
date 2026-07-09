#!/usr/bin/env node

/**
 * build.js - Donkeycraft Build System
 *
 * Compiles index.html with all JS and CSS inlined into:
 *   - build/donkeycraft-full.html  (inlined, readable)
 *   - build/donkeycraft-prod.html  (inlined + minified)
 *
 * Pipeline stages: format → lint → compile
 *
 * CLI: Supports fuzzy argument matching with Levenshtein distance and Jaro-Winkler similarity.
 *   Examples: -f, f, --format, -format, --formaf, --frmato
 */

const fs = require('fs');
const path = require('path');

// --- Resolve paths ---
const TOOLS_DIR = __dirname;
const PROJECT_ROOT = path.join(TOOLS_DIR, '..');

// --- Load modules ---
const argsModule = require('./args.js');
const formatModule = require('./format.js');
const lintModule = require('./lint.js');
const compileModule = require('./compile.js');

// --- Load project config ---
function loadConfig() {
  const configPath = path.join(TOOLS_DIR, 'project.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// --- Print build header ---
function printHeader() {
  const config = loadConfig();
  console.log('');
  console.log('========================================');
  console.log(`  ${config.project} Build System`);
  console.log('========================================');
  console.log(`  Config:   tools/project.json`);
  console.log(`  Root:     ${path.relative(PROJECT_ROOT, PROJECT_ROOT)}`);
  console.log(`  Node:     v${process.version.replace('v', '')}`);
  console.log('========================================');
}

// --- Print build footer ---
function printFooter(startTime, stages) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('');
  console.log('========================================');
  console.log('  Build Summary');
  console.log('========================================');

  for (const stage of stages) {
    const statusIcon = stage.success ? '✓' : '✗';
    const statusText = stage.success ? 'PASSED' : 'FAILED';
    console.log(`  ${statusIcon} ${stage.name.padEnd(16)} ${statusText.padEnd(8)} (${stage.duration}s)`);
  }

  console.log('');
  console.log(`  Total time:   ${elapsed}s`);
  console.log('========================================');
  console.log('');
}

// --- Run a pipeline stage ---
async function runStage(name, fn) {
  const start = Date.now();
  console.log('');
  console.log(`--- Stage: ${name} ---`);

  try {
    const result = await fn();
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    return { ...result, name, duration: parseFloat(duration), success: result.success !== false };
  } catch (err) {
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.error(`[build] Stage ${name} failed: ${err.message}`);
    return { success: false, error: err.message, name, duration: parseFloat(duration) };
  }
}

// --- Format stage ---
async function formatStage() {
  const result = await formatModule.run();
  if (!result || !result.success) {
    return { success: false, reason: result?.reason || 'format-failed' };
  }
  return {
    success: true,
    formatted: result.formatted?.length || 0,
    total: result.total || 0,
    reformatCount: result.reformatCount || 0,
  };
}

// --- Lint stage ---
async function lintStage() {
  const result = await lintModule.run();
  if (!result || !result.success) {
    return { success: false, reason: result?.reason || 'lint-failed' };
  }
  return { success: true };
}

// --- Compile stage ---
async function compileStage() {
  const result = await compileModule.run();
  if (!result || !result.success) {
    return { success: false, reason: result?.reason || 'compile-failed' };
  }
  return {
    success: true,
    full: result.full,
    prod: result.prod,
  };
}

// --- Report stage (file state overview) ---
async function reportStage() {
  const config = loadConfig();
  const inputPath = path.join(PROJECT_ROOT, config.input);

  console.log('');
  console.log('--- File State Report ---');

  // Input file info
  if (fs.existsSync(inputPath)) {
    const stats = fs.statSync(inputPath);
    const content = fs.readFileSync(inputPath, 'utf8');
    const lines = (content.match(/\n/g) || []).length + 1;
    console.log(`  Input HTML: ${path.relative(PROJECT_ROOT, inputPath)}`);
    console.log(`    Size:     ${compileModule.formatFileSize(stats.size)}`);
    console.log(`    Lines:    ${lines.toLocaleString()}`);
    console.log(`    Modified: ${stats.mtime.toISOString()}`);
  }

  // Source file counts
  const srcDir = path.join(PROJECT_ROOT, 'src');
  if (fs.existsSync(srcDir)) {
    const jsFiles = formatModule.collectFiles(config).jsFiles;
    const cssFiles = formatModule.collectFiles(config).cssFiles;

    let totalJsSize = 0;
    let totalJsLines = 0;
    for (const f of jsFiles) {
      const s = fs.statSync(f);
      const c = fs.readFileSync(f, 'utf8');
      totalJsSize += s.size;
      totalJsLines += (c.match(/\n/g) || []).length + 1;
    }

    let totalCssSize = 0;
    let totalCssLines = 0;
    for (const f of cssFiles) {
      const s = fs.statSync(f);
      const c = fs.readFileSync(f, 'utf8');
      totalCssSize += s.size;
      totalCssLines += (c.match(/\n/g) || []).length + 1;
    }

    console.log('');
    console.log(`  Source files:`);
    console.log(`    JS:   ${jsFiles.length} files, ${compileModule.formatFileSize(totalJsSize)}, ${totalJsLines.toLocaleString()} lines`);
    console.log(`    CSS:  ${cssFiles.length} files, ${compileModule.formatFileSize(totalCssSize)}, ${totalCssLines.toLocaleString()} lines`);
    console.log(`    Total: ${jsFiles.length + cssFiles.length} files, ${compileModule.formatFileSize(totalJsSize + totalCssSize)}`);
  }

  // Build output info
  const buildDir = path.join(PROJECT_ROOT, config.outputDir);
  if (fs.existsSync(buildDir)) {
    console.log('');
    console.log(`  Build output (${config.outputDir}/):`);
    const buildFiles = fs.readdirSync(buildDir);
    for (const bf of buildFiles) {
      const fp = path.join(buildDir, bf);
      const s = fs.statSync(fp);
      const c = fs.readFileSync(fp, 'utf8');
      const lines = (c.match(/\n/g) || []).length + 1;
      console.log(`    ${bf.padEnd(30)} ${compileModule.formatFileSize(s.size).padEnd(12)} ${lines.toLocaleString()} lines`);
    }
  } else {
    console.log('');
    console.log(`  Build output: No build directory found (run --compile first)`);
  }

  console.log('');
  return { success: true };
}

// --- Full pipeline ---
async function fullPipeline() {
  const stages = [];

  // Stage 1: Format
  const formatResult = await runStage('Format', formatStage);
  stages.push(formatResult);
  if (!formatResult.success) {
    console.log(`[build] ✗ Format failed: ${formatResult.reason}`);
    return { success: false, stages };
  }

  // Stage 2: Lint
  const lintResult = await runStage('Lint', lintStage);
  stages.push(lintResult);
  if (!lintResult.success) {
    console.log(`[build] ✗ Lint failed: ${lintResult.reason}`);
    return { success: false, stages };
  }

  // Stage 3: Compile
  const compileResult = await runStage('Compile', compileStage);
  stages.push(compileResult);
  if (!compileResult.success) {
    console.log(`[build] ✗ Compile failed: ${compileResult.reason}`);
    return { success: false, stages };
  }

  return { success: true, stages };
}

// --- Main ---
async function main() {
  const startTime = Date.now();
  printHeader();

  // Parse arguments
  const parsed = argsModule.run(process.argv);
  const { commands, hasCommand, getWarnings } = parsed;

  // Determine which stages to run
  const shouldFormat = hasCommand('format');
  const shouldLint = hasCommand('lint');
  const shouldCompile = hasCommand('compile') || hasCommand('prod') || hasCommand('full') || hasCommand('all');
  const shouldReport = hasCommand('report');

  // Default: full pipeline if no commands given
  const anyCommand = commands.length > 0;

  let result;

  if (shouldReport) {
    result = await reportStage();
  } else if (!anyCommand || hasCommand('all') || hasCommand('full')) {
    // Full pipeline: format → lint → compile
    result = await fullPipeline();
  } else if (shouldFormat && shouldLint && shouldCompile) {
    // Manual multi-stage
    const stages = [];

    const formatResult = await runStage('Format', formatStage);
    stages.push(formatResult);
    if (!formatResult.success) {
      console.log(`[build] ✗ Format failed: ${formatResult.reason}`);
      result = { success: false, stages };
    } else {
      const lintResult = await runStage('Lint', lintStage);
      stages.push(lintResult);
      if (!lintResult.success) {
        console.log(`[build] ✗ Lint failed: ${lintResult.reason}`);
        result = { success: false, stages };
      } else {
        const compileResult = await runStage('Compile', compileStage);
        stages.push(compileResult);
        if (!compileResult.success) {
          console.log(`[build] ✗ Compile failed: ${compileResult.reason}`);
          result = { success: false, stages };
        } else {
          result = { success: true, stages };
        }
      }
    }
  } else if (shouldFormat) {
    result = await runStage('Format', formatStage);
    result = { ...result, stages: [result] };
  } else if (shouldLint) {
    result = await runStage('Lint', lintStage);
    result = { ...result, stages: [result] };
  } else if (shouldCompile) {
    result = await runStage('Compile', compileStage);
    result = { ...result, stages: [result] };
  }

  // Print footer
  const stages = result.stages || [];
  printFooter(startTime, stages);

  // Exit with appropriate code
  if (!result.success) {
    console.log('[build] ✗ Build FAILED');
    process.exit(1);
  } else {
    console.log('[build] ✓ Build SUCCESS');
    process.exit(0);
  }
}

// --- Run ---
main().catch(err => {
  console.error('[build] Fatal error:', err.message);
  process.exit(2);
});