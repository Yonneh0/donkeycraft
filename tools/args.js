#!/usr/bin/env node

/**
 * args.js - Fuzzy argument parser for the Donkeycraft build system.
 *
 * Supports all common CLI formats with typo tolerance:
 *   - Short flag:    -f, -l, -c, -r, -h
 *   - Bare word:     format, lint, compile, prod, report, help
 *   - Long flag:     --format, --lint, --compile, --prod, --report, --help
 *   - Mixed flag:    -format, --formaf (typo)
 *
 * Uses Levenshtein distance and Jaro-Winkler similarity for fuzzy matching.
 */

// --- Levenshtein Distance ---
function levenshteinDistance(a, b) {
  const al = a.length;
  const bl = b.length;
  const matrix = [];

  for (let i = 0; i <= al; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bl; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      if (a.charAt(i - 1) === b.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j] + 1       // deletion
        );
      }
    }
  }

  return matrix[al][bl];
}

// --- Jaro-Winkler Similarity ---
function jaroSimilarity(a, b) {
  const al = a.length;
  const bl = b.length;

  if (al === 0 && bl === 0) return 1.0;
  if (al === 0 || bl === 0) return 0.0;

  const matchDistance = Math.max(al, bl) >> 1 - 1;
  const aMatches = new Array(al).fill(false);
  const bMatches = new Array(bl).fill(false);
  const matches = [];
  const transpositions = [];

  let matchCount = 0;

  for (let i = 0; i < al; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, bl);

    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;

      aMatches[i] = true;
      bMatches[j] = true;
      matches.push(i);
      matchCount++;
      break;
    }
  }

  if (matchCount === 0) return 0.0;

  let t = 0;
  let point = 0;
  for (let i = 0; i < matchCount; i++) {
    while (!bMatches[point]) point++;
    if (a[matches[i]] !== b[point]) {
      t += 0.5;
    }
    point++;
  }
  t /= 2;

  const m0 = matchCount / al;
  const m1 = matchCount / bl;
  const mt = (matchCount - t) / matchCount;

  return (m0 + m1 + mt) / 3;
}

function jaroWinklerSimilarity(a, b) {
  const j = jaroSimilarity(a, b);
  const prefixLen = Math.min(4, Math.min(a.length, b.length));

  let commonPrefix = 0;
  for (let i = 0; i < prefixLen; i++) {
    if (a[i] === b[i]) {
      commonPrefix++;
    } else {
      break;
    }
  }

  return j + commonPrefix * 0.1 * (1 - j);
}

// --- Known commands ---
const KNOWN_COMMANDS = [
  'format',
  'lint',
  'compile',
  'prod',
  'full',
  'report',
  'help',
  'all',
];

// Short flag aliases
const SHORT_ALIASES = {
  f: 'format',
  l: 'lint',
  c: 'compile',
  p: 'prod',
  r: 'report',
  h: 'help',
};

// Long flag mappings
const LONG_FLAGS = {
  format: true,
  lint: true,
  compile: true,
  prod: true,
  full: true,
  report: true,
  help: true,
  all: true,
};

// --- Resolve a single arg to a known command ---
function resolveArg(arg) {
  // Strip leading dashes
  let cleaned = arg;
  if (cleaned.startsWith('--')) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('-')) {
    cleaned = cleaned.substring(1);
  }

  // Check short alias (single char)
  if (cleaned.length === 1 && SHORT_ALIASES[cleaned]) {
    return { command: SHORT_ALIASES[cleaned], original: arg, matched: true, score: 1.0, method: 'alias' };
  }

  // Check exact match (case-insensitive)
  const lower = cleaned.toLowerCase();
  if (LONG_FLAGS[lower]) {
    return { command: lower, original: arg, matched: true, score: 1.0, method: 'exact' };
  }

  // Check bare word exact match
  if (KNOWN_COMMANDS.includes(lower)) {
    return { command: lower, original: arg, matched: true, score: 1.0, method: 'exact' };
  }

  // Fuzzy matching
  let bestMatch = null;
  let bestScore = 0;
  let bestMethod = '';

  for (const cmd of KNOWN_COMMANDS) {
    const lev = levenshteinDistance(lower, cmd);
    const jw = jaroWinklerSimilarity(lower, cmd);

    // Check if within Levenshtein threshold
    if (lev <= 2 && jw >= 0.85) {
      // Combined score: prefer higher Jaro-Winkler, bonus for closer Levenshtein
      const score = jw * 0.7 + (1 - lev / 4) * 0.3;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = cmd;
        bestMethod = jw > 0.9 ? 'jaro-winkler' : 'levenshtein';
      }
    }
  }

  if (bestMatch) {
    return { command: bestMatch, original: arg, matched: true, score: bestScore, method: bestMethod };
  }

  // No match found — suggest closest
  let closestDist = Infinity;
  let closestCmd = null;
  for (const cmd of KNOWN_COMMANDS) {
    const d = levenshteinDistance(lower, cmd);
    if (d < closestDist) {
      closestDist = d;
      closestCmd = cmd;
    }
  }

  return { command: null, original: arg, matched: false, score: 0, method: 'none', suggestion: closestCmd };
}

// --- Parse all arguments ---
function parseArgs(argv) {
  const args = argv.slice(2); // Skip node and script path
  const results = [];
  const warnings = [];
  const errors = [];

  for (const rawArg of args) {
    // Handle combined short flags like -fl
    if (rawArg.startsWith('-') && rawArg.length > 2 && !rawArg.startsWith('--')) {
      for (const char of rawArg.substring(1)) {
        const resolved = resolveArg(char);
        if (resolved.matched) {
          results.push(resolved);
        } else {
          errors.push({ arg: '-' + char, suggestion: resolved.suggestion });
        }
      }
      continue;
    }

    const resolved = resolveArg(rawArg);
    if (resolved.matched) {
      results.push(resolved);
    } else if (resolved.suggestion) {
      warnings.push({ arg: rawArg, suggestion: resolved.suggestion });
    } else {
      errors.push({ arg: rawArg });
    }
  }

  return { results, warnings, errors };
}

// --- Get help text ---
function getHelpText(suggestion) {
  let lines = [];
  lines.push('');
  lines.push('=== Donkeycraft Build System — Usage ===');
  lines.push('');
  lines.push('Commands (all formats supported: -f, f, --format, -format, etc.):');
  lines.push('');
  lines.push('  --format, -f    Auto-format all source files (JS + CSS)');
  lines.push('  --lint, -l      Lint all source files (fail on warnings/errors)');
  lines.push('  --compile, -c   Compile HTML (inline + minify)');
  lines.push('  --prod          Production build (format + lint + compile + minify)');
  lines.push('  --full          Full pipeline (format + lint + compile, no minify)');
  lines.push('  --report, -r    Show file state report only');
  lines.push('  --help, -h      Show this help message');
  lines.push('  --all           Run full pipeline including production build');
  lines.push('');
  lines.push('Examples:');
  lines.push('  node tools/build.js                  # Full pipeline (format → lint → compile)');
  lines.push('  node tools/build.js --format         # Format only');
  lines.push('  node tools/build.js -f -l            # Format + lint');
  lines.push('  node tools/build.js --compile --prod # Compile + production build');
  lines.push('  node tools/build.js formaf           # Typo-tolerant: auto-corrected to "format"');
  lines.push('  node tools/build.js --linit          # Typo-tolerant: auto-corrected to "lint"');
  lines.push('');

  if (suggestion) {
    lines.push('Unknown commands detected:');
    for (const w of suggestion) {
      if (w.suggestion) {
        lines.push(`  "${w.arg}" → did you mean "${w.suggestion}"?`);
      } else {
        lines.push(`  "${w.arg}" — no matching command found`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// --- Deduplicate results ---
function deduplicate(results) {
  const seen = new Set();
  const unique = [];
  for (const r of results) {
    if (!seen.has(r.command)) {
      seen.add(r.command);
      unique.push(r);
    }
  }
  return unique;
}

// --- Main export ---
function run(argv) {
  const parsed = parseArgs(argv);

  // If help requested, print and exit
  const hasHelp = parsed.results.some(r => r.command === 'help');
  if (hasHelp) {
    console.log(getHelpText(parsed.warnings.length > 0 ? parsed.warnings : null));
    process.exit(0);
  }

  // Print warnings for typos
  for (const w of parsed.warnings) {
    if (w.suggestion) {
      console.error(`[args] Warning: "${w.arg}" resolved to "${w.suggestion}"`);
    } else {
      console.error(`[args] Error: Unknown argument "${w.arg}"`);
    }
  }

  // Print errors for unrecognized args
  for (const e of parsed.errors) {
    if (e.suggestion) {
      console.error(`[args] Error: "${e.arg}" — did you mean "${e.suggestion}"?`);
    } else {
      console.error(`[args] Error: Unknown argument "${e.arg}"`);
    }
  }

  // If there are unmatched errors, exit with code 1
  if (parsed.errors.length > 0) {
    console.log('');
    console.log(getHelpText(parsed.warnings.length > 0 ? parsed.warnings : parsed.errors));
    process.exit(1);
  }

  // Deduplicate
  const commands = deduplicate(parsed.results);

  return {
    commands,
    hasCommand: (cmd) => commands.some(r => r.command === cmd),
    getWarnings: () => parsed.warnings,
  };
}

module.exports = {
  levenshteinDistance,
  jaroWinklerSimilarity,
  resolveArg,
  parseArgs,
  run,
  getHelpText,
  deduplicate,
  KNOWN_COMMANDS,
  SHORT_ALIASES,
};