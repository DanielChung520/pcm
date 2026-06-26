const native = require('./pcm-engine.node');

/**
 * PCM Rust Engine — native Node.js addon
 * Provides high-performance graph operations
 */
class GraphEngine {
  constructor() {
    this.loaded = true;
  }

  findDependents(symbols, relationships, seedIds, maxDepth = 10) {
    const result = native.findDependents(
      { symbols, relationships },
      seedIds,
      maxDepth,
    );
    return JSON.parse(result);
  }

  findPaths(symbols, relationships, sourceId, targetId, maxDepth = 10) {
    const result = native.findPaths(
      { symbols, relationships },
      sourceId,
      targetId,
      maxDepth,
    );
    return JSON.parse(result);
  }

  detectCycles(symbols, relationships) {
    const result = native.detectCycles({ symbols, relationships });
    return JSON.parse(result);
  }

  computeImpactScores(symbols, relationships, seedId) {
    const result = native.computeImpactScores(
      { symbols, relationships },
      seedId,
    );
    return JSON.parse(result);
  }

  generateUuid() {
    return native.generateUuid();
  }
}

module.exports = { GraphEngine, native };
