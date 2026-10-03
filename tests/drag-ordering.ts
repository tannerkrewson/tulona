import { dragTarget, moveId } from '../src/ui/reorder';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const assert = require('node:assert/strict');

const centers = [25, 95, 190, 300];
assert.equal(dragTarget(centers, 0, 20), 0, 'small movement retains position');
assert.equal(
  dragTarget(centers, 0, 180),
  2,
  'crossing measured midpoints moves through differently sized rows'
);
assert.equal(dragTarget(centers, 3, -220), 1, 'upward movement uses measured centers');
assert.equal(dragTarget(centers, 1, 1000), 3, 'drag clamps to the last row');
assert.equal(dragTarget(centers, 2, -1000), 0, 'drag clamps to the first row');
assert.deepEqual(moveId(['a', 'b', 'c', 'd'], 0, 3), ['b', 'c', 'd', 'a']);
assert.deepEqual(moveId(['a', 'b'], 0, -1), ['a', 'b'], 'keyboard movement stops at list bounds');
console.log('Validated variable-height drag placement and keyboard bounds.');
