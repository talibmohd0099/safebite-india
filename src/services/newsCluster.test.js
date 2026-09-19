import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterNewsItems } from './newsCluster.js';

test('items with no event_key each stay their own single card', () => {
  const items = [{ id: 'a', event_key: null }, { id: 'b', event_key: null }];
  const result = clusterNewsItems(items);
  assert.equal(result.length, 2);
  assert.deepEqual(result, [{ isCluster: false, item: items[0] }, { isCluster: false, item: items[1] }]);
});

test('groups items sharing the same event_key into one cluster', () => {
  const items = [
    { id: 'a', event_key: 'fssai-nestle' },
    { id: 'b', event_key: null },
    { id: 'c', event_key: 'fssai-nestle' },
    { id: 'd', event_key: 'fssai-nestle' },
  ];
  const result = clusterNewsItems(items);
  assert.equal(result.length, 2); // the cluster + item b
  assert.deepEqual(result[0], { isCluster: true, key: 'fssai-nestle', items: [items[0], items[2], items[3]] });
  assert.deepEqual(result[1], { isCluster: false, item: items[1] });
});

test('a cluster takes the position of its first (most recent) member -- ordering preserved', () => {
  const items = [
    { id: 'a', event_key: null },
    { id: 'b', event_key: 'story-1' },
    { id: 'c', event_key: null },
    { id: 'd', event_key: 'story-1' },
  ];
  const result = clusterNewsItems(items);
  assert.equal(result.length, 3);
  assert.equal(result[0].item.id, 'a');
  assert.equal(result[1].isCluster, true);
  assert.equal(result[1].key, 'story-1');
  assert.equal(result[2].item.id, 'c');
});

test('an event_key that only ever matches one item is NOT shown as a cluster (would mislead with "1 source")', () => {
  const items = [{ id: 'a', event_key: 'stray-key' }, { id: 'b', event_key: null }];
  const result = clusterNewsItems(items);
  assert.deepEqual(result, [{ isCluster: false, item: items[0] }, { isCluster: false, item: items[1] }]);
});

test('two separate clusters stay separate', () => {
  const items = [
    { id: 'a', event_key: 'story-1' },
    { id: 'b', event_key: 'story-2' },
    { id: 'c', event_key: 'story-1' },
    { id: 'd', event_key: 'story-2' },
  ];
  const result = clusterNewsItems(items);
  assert.equal(result.length, 2);
  assert.equal(result[0].key, 'story-1');
  assert.equal(result[1].key, 'story-2');
});

test('an empty list returns an empty list', () => {
  assert.deepEqual(clusterNewsItems([]), []);
});
