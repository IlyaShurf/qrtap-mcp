#!/usr/bin/env node
// Thin launcher for the compiled entrypoint. Kept as a separate file so the
// `bin` path stays stable regardless of how dist/ is produced, and so the
// published package starts with plain Node and zero runtime dependencies.
import "../dist/index.js";
