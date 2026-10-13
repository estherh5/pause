import { describe, it, expect } from 'vitest';
import { newShareId } from './share-id.js';

describe('newShareId', () => {
  it('is 16 alphanumeric characters, like pause_api external ids', () => {
    for (let i = 0; i < 200; i++) expect(newShareId()).toMatch(/^[A-Za-z0-9]{16}$/);
  });
  it('does not repeat across 1000 draws', () => {
    expect(new Set(Array.from({ length: 1000 }, newShareId)).size).toBe(1000);
  });
});
