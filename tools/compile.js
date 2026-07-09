#!/usr/bin/env node

/**
 * compile.js - Compile index.html with all JS and CSS inlined.
 *
 * Produces:
 *   - build/donkeycraft-full.html  (inlined, readable)
 *   - build/donkeycraft-prod.html  (inlined + minified)
 */

const fs = require('fs');
const path = require('path');

// --- Resolve paths ---
const TOOLS_DIR = __dirname;
const PROJECT_ROOT = path.join(TOOLS_DIR, '..');
const BUILD_DIR = path.join(PROJECT_ROOT, 'build');

// --- Load project config ---
function loadConfig() {
  const configPath = path.join(TOOLS_DIR, 'project.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// --- Format file size for display ---
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// --- Read CSS, resolving @import statements ---
function readCSSWithImports(cssPath, visited = new Set()) {
  if (visited.has(cssPath)) {
    console.log(`[compile]   Warning: Circular @import detected: ${path.relative(PROJECT_ROOT, cssPath)}`);
    return '';
  }
  visited.add(cssPath);

  const css = fs.readFileSync(cssPath, 'utf8');
  const cssDir = path.dirname(cssPath);

  return css.replace(/@import\s+['"]([^'"]+)['"];?\s*/gi, (_match, href) => {
    const resolvedPath = path.resolve(cssDir, href);
    if (!fs.existsSync(resolvedPath)) {
      console.log(`[compile]   Warning: @import not found: ${href}`);
      return _match;
    }
    return readCSSWithImports(resolvedPath, visited);
  });
}

// --- Collect CSS file paths from HTML ---
function collectCssLinks(html) {
  const links = [];
  const regex = /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    links.push(match[1]);
  }
  return links;
}

// --- Collect JS file paths from HTML ---
function collectJsLinks(html) {
  const files = [];
  const regex = /<script\s+src="([^"]+)"><\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    files.push(match[1]);
  }
  return files;
}

// --- Collect all referenced CSS files (with @import resolution) ---
function collectAllCssFiles(cssLinks) {
  const cssSet = new Set();
  for (const href of cssLinks) {
    const cssPath = path.join(PROJECT_ROOT, href);
    if (fs.existsSync(cssPath)) {
      cssSet.add(cssPath);
      // Recursively resolve @imports
      const css = fs.readFileSync(cssPath, 'utf8');
      const cssDir = path.dirname(cssPath);
      const importRegex = /@import\s+['"]([^'"]+)['"];?\s*/gi;
      let impMatch;
      while ((impMatch = importRegex.exec(css)) !== null) {
        const resolvedPath = path.resolve(cssDir, impMatch[1]);
        if (fs.existsSync(resolvedPath)) {
          cssSet.add(resolvedPath);
        }
      }
    }
  }
  return [...cssSet].sort();
}

// --- Inline CSS into <style> tags ---
function inlineCss(html) {
  return html.replace(
    /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/gi,
    (_match, href) => {
      const cssPath = path.join(PROJECT_ROOT, href);
      if (!fs.existsSync(cssPath)) {
        console.log(`[compile]   Warning: CSS not found: ${href}`);
        return _match;
      }
      try {
        const css = readCSSWithImports(cssPath);
        return `<style>\n/* ${href} */\n${css}\n</style>`;
      } catch (err) {
        console.error(`[compile] Error reading CSS: ${href}`);
        throw err;
      }
    }
  );
}

// --- Inline JS into <script> tags ---
function inlineJs(html) {
  return html.replace(
    /<script\s+src="([^"]+)"><\/script>/gi,
    (_match, src) => {
      const jsPath = path.join(PROJECT_ROOT, src);
      if (!fs.existsSync(jsPath)) {
        console.log(`[compile]   Warning: JS not found: ${src}`);
        return _match;
      }
      try {
        const js = fs.readFileSync(jsPath, 'utf8');
        return `<script>\n// ${src}\n${js}\n<\/script>`;
      } catch (err) {
        console.error(`[compile] Error reading JS: ${src}`);
        throw err;
      }
    }
  );
}

// --- Log file info ---
function logFileEntry(label, filePath) {
  if (!fs.existsSync(filePath)) return;
  const stats = fs.statSync(filePath);
  const size = stats.size;
  const lines = (fs.readFileSync(filePath, 'utf8').match(/\n/g) || []).length + 1;
  const relPath = path.relative(PROJECT_ROOT, filePath);
  console.log(`  ${label.padEnd(12)} ${relPath.padEnd(40)} ${formatFileSize(size).padEnd(12)} ${lines.toLocaleString()} lines`);
}

// --- Log source file breakdown ---
function logSourceBreakdown(cssFiles, jsFiles) {
  console.log('');
  console.log('  Source files:');

  if (cssFiles.length > 0) {
    let totalCssSize = 0;
    let totalCssLines = 0;
    for (const f of cssFiles) {
      const stats = fs.statSync(f);
      const content = fs.readFileSync(f, 'utf8');
      const lines = (content.match(/\n/g) || []).length + 1;
      totalCssSize += stats.size;
      totalCssLines += lines;
    }
    console.log(`    CSS: ${cssFiles.length} files, ${formatFileSize(totalCssSize)}, ${totalCssLines.toLocaleString()} lines`);
  }

  if (jsFiles.length > 0) {
    let totalJsSize = 0;
    let totalJsLines = 0;
    for (const f of jsFiles) {
      const stats = fs.statSync(f);
      const content = fs.readFileSync(f, 'utf8');
      const lines = (content.match(/\n/g) || []).length + 1;
      totalJsSize += stats.size;
      totalJsLines += lines;
    }
    console.log(`    JS:  ${jsFiles.length} files, ${formatFileSize(totalJsSize)}, ${totalJsLines.toLocaleString()} lines`);
  }
}

// --- Generate file report for AI context ---
function generateReport(inlinedHtml, cssFiles, jsFiles, inputPath) {
  const report = [];
  report.push('');
  report.push('=== Build Report ===');
  report.push('');
  report.push(`Project:    ${loadConfig().project}`);
  report.push(`Input:      ${path.relative(PROJECT_ROOT, inputPath)}`);
  report.push(`Timestamp:  ${new Date().toISOString()}`);
  report.push('');

  report.push('--- Source Files ---');
  report.push(`CSS: ${cssFiles.length} files`);
  for (const f of cssFiles) {
    const stats = fs.statSync(f);
    const content = fs.readFileSync(f, 'utf8');
    const lines = (content.match(/\n/g) || []).length + 1;
    report.push(`  ${path.relative(PROJECT_ROOT, f).padEnd(45)} ${formatFileSize(stats.size).padEnd(12)} ${lines.toLocaleString()} lines`);
  }

  report.push(`JS:  ${jsFiles.length} files`);
  for (const f of jsFiles) {
    const stats = fs.statSync(f);
    const content = fs.readFileSync(f, 'utf8');
    const lines = (content.match(/\n/g) || []).length + 1;
    report.push(`  ${path.relative(PROJECT_ROOT, f).padEnd(45)} ${formatFileSize(stats.size).padEnd(12)} ${lines.toLocaleString()} lines`);
  }

  report.push('');
  report.push('--- Output Files ---');
  report.push(`Total source size:  ${formatFileSize(cssFiles.reduce((s, f) => s + fs.statSync(f).size, 0) + jsFiles.reduce((s, f) => s + fs.statSync(f).size, 0))}`);
  report.push(`Inlined HTML size:  ${formatFileSize(inlinedHtml.length)}`);
  report.push(`Compression ratio:  ${(inlinedHtml.length / (cssFiles.reduce((s, f) => s + fs.statSync(f).size, 0) + jsFiles.reduce((s, f) => s + fs.statSync(f).size, 0))).toFixed(2)}x`);
  report.push('');

  return report.join('\n');
}

// --- Simple JS minifier (removes comments, collapses whitespace) ---
function minifyJs(jsContent) {
  // Remove single-line comments (// ...) but not in strings
  let result = '';
  let i = 0;

  while (i < jsContent.length) {
    // Handle strings
    if (jsContent[i] === '"' || jsContent[i] === "'") {
      const quote = jsContent[i];
      result += jsContent[i];
      i++;
      while (i < jsContent.length && jsContent[i] !== quote) {
        if (jsContent[i] === '\\') {
          result += jsContent[i];
          i++;
          if (i < jsContent.length) {
            result += jsContent[i];
            i++;
          }
        } else {
          result += jsContent[i];
          i++;
        }
      }
      if (i < jsContent.length) {
        result += jsContent[i]; // closing quote
        i++;
      }
      continue;
    }

    // Remove single-line comments
    if (jsContent[i] === '/' && i + 1 < jsContent.length && jsContent[i + 1] === '/') {
      while (i < jsContent.length && jsContent[i] !== '\n') i++;
      continue;
    }

    // Remove multi-line comments
    if (jsContent[i] === '/' && i + 1 < jsContent.length && jsContent[i + 1] === '*') {
      i += 2;
      while (i < jsContent.length - 1 && !(jsContent[i] === '*' && jsContent[i + 1] === '/')) i++;
      i += 2; // skip */
      result += ' '; // replace comment with space
      continue;
    }

    result += jsContent[i];
    i++;
  }

  // Collapse whitespace (but preserve newlines for structure)
  return result
    .replace(/\r\n/g, '\n')
    .replace(/  +/g, ' ') // collapse spaces
    .replace(/\n+/g, '\n') // collapse newlines to single
    .replace(/\s*{\s*/g, '{\n  ')
    .replace(/\s*}\s*/g, '\n}')
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s*\[\s*/g, '[')
    .replace(/\s*\]\s*/g, ']')
    .replace(/\n\s*\n/g, '\n') // remove blank lines
    .trim();
}

// --- Simple CSS minifier ---
function minifyCss(cssContent) {
  return cssContent
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove comments
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ') // collapse whitespace
    .replace(/\s*{\s*/g, '{')
    .replace(/\s*}\s*/g, '}')
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*,\s*/g, ',')
    .trim();
}

// --- Minify HTML (inline minifier — no external deps required) ---
function minifyHtml(html) {
  // Strategy: Split by script/style blocks, minify each part appropriately
  const parts = html.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/gi);

  const minifiedParts = parts.map(part => {
    const trimmed = part.trim();

    // Skip empty parts
    if (!trimmed) return '';

    // HTML parts: collapse whitespace, remove comments
    if (!/^<script/i.test(trimmed) && !/^<style/i.test(trimmed)) {
      return trimmed
        .replace(/<!--[\s\S]*?-->/g, '') // remove HTML comments
        .replace(/\s+/g, ' ') // collapse whitespace
        .replace(/>\s+</g, '><') // remove whitespace between tags
        .trim();
    }

    // Script tag: minify JS content
    if (/^<script/i.test(trimmed)) {
      // Check if it's type="text/plain" (shader content) — still minify but preserve structure
      const isPlain = /type\s*=\s*["']text\/plain["']/i.test(trimmed);

      // Extract tag and content
      const tagMatch = trimmed.match(/^(<script[^>]*>)([\s\S]*)(<\/script>)$/i);
      if (!tagMatch) return part;

      const [_, tag, content, closeTag] = tagMatch;

      // For type="text/plain" (shaders), remove comments but preserve line structure
      let minifiedContent;
      if (isPlain) {
        minifiedContent = content
          .replace(/\/\/\/.*/g, '') // remove /// comments
          .replace(/\r\n/g, '\n')
          .replace(/[ \t]+$/gm, '') // trim trailing whitespace
          .replace(/\n{3,}/g, '\n\n'); // collapse multiple blank lines
      } else {
        minifiedContent = minifyJs(content);
      }

      return tag + minifiedContent + closeTag;
    }

    // Style tag: minify CSS content
    const styleMatch = trimmed.match(/^(<style[\s\S]*?>)([\s\S]*)(<\/style>)$/i);
    if (styleMatch) {
      const [_, tag, content, closeTag] = styleMatch;
      return tag + minifyCss(content) + closeTag;
    }

    return part;
  });

  return minifiedParts.join('');
}

// --- Compile HTML ---
function compileHtml(inputPath) {
  let html;
  try {
    html = fs.readFileSync(inputPath, 'utf8');
  } catch (err) {
    console.error(`[compile] Error: Cannot read ${inputPath}`);
    throw err;
  }

  // Collect source files
  const cssLinks = collectCssLinks(html);
  const jsLinks = collectJsLinks(html);
  const allCssFiles = collectAllCssFiles(cssLinks);
  const allJsFiles = jsLinks.map(j => path.join(PROJECT_ROOT, j)).filter(f => fs.existsSync(f));

  // Log source breakdown
  logSourceBreakdown(allCssFiles, allJsFiles);

  // Inline CSS and JS
  console.log('[compile] Inlining CSS...');
  let inlined = inlineCss(html);

  console.log('[compile] Inlining JS...');
  inlined = inlineJs(inlined);

  return { inlined, cssFiles: allCssFiles, jsFiles: allJsFiles };
}

// --- Write output file ---
function writeOutput(label, outputPath, content) {
  try {
    fs.writeFileSync(outputPath, content, 'utf8');
    const stats = fs.statSync(outputPath);
    const lines = (content.match(/\n/g) || []).length + 1;
    console.log(`[compile] ${label.padEnd(12)} ${path.relative(PROJECT_ROOT, outputPath).padEnd(40)} ${formatFileSize(stats.size).padEnd(12)} ${lines.toLocaleString()} lines`);
  } catch (err) {
    console.error(`[compile] Error: Cannot write ${outputPath}`);
    throw err;
  }
}

// --- Main compile function ---
function run() {
  const config = loadConfig();
  const inputPath = path.join(PROJECT_ROOT, config.input);
  const outputDir = path.join(PROJECT_ROOT, config.outputDir);

  // Create build directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('[compile] Starting compilation...');
  console.log(`[compile] Input: ${path.relative(PROJECT_ROOT, inputPath)}`);

  // Compile
  const { inlined, cssFiles, jsFiles } = compileHtml(inputPath);

  // Write full build (inlined, readable)
  const fullPath = path.join(outputDir, config.outputs.full);
  console.log(`[compile] Writing: ${path.relative(PROJECT_ROOT, fullPath)}`);
  writeOutput('Full:', fullPath, inlined);

  // Write production build (inlined + minified)
  console.log('[compile] Minifying for production build...');
  const prodHtml = minifyHtml(inlined);
  const prodPath = path.join(outputDir, config.outputs.prod);
  console.log(`[compile] Writing: ${path.relative(PROJECT_ROOT, prodPath)}`);
  writeOutput('Prod:', prodPath, prodHtml);

  // Generate and print report
  const report = generateReport(inlined, cssFiles, jsFiles, inputPath);
  console.log(report);

  return {
    success: true,
    full: fullPath,
    prod: prodPath,
    report,
  };
}

module.exports = { run, compileHtml, minifyHtml, collectCssLinks, collectJsLinks, collectAllCssFiles, inlineCss, inlineJs, formatFileSize, generateReport };

// Run if executed directly
if (require.main === module) {
  const result = run();
  if (!result.success) {
    process.exit(1);
  }
}