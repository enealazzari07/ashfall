import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ChunkManager } from '../src/world/ChunkManager';
import { buildingWalls, generateChunk } from '../src/world/CityGenerator';

describe('CityGenerator', () => {
  it('ist deterministisch', () => {
    expect(generateChunk(3, -2)).toEqual(generateChunk(3, -2));
  });

  it('lässt eine Türöffnung in der Wand', () => {
    const b = generateChunk(0, 0).buildings[0];
    const walls = buildingWalls(b);
    expect(walls.length).toBe(5); // 3 volle Wände + 2 Türsegmente
  });
});

describe('ChunkManager.resolve', () => {
  it('schiebt den Spieler aus einer Wand heraus', () => {
    const cm = new ChunkManager();
    cm.update(4, 4);
    const b = generateChunk(0, 0).buildings[0];
    const wall = buildingWalls(b).find((w) => w.w > 3 || w.d > 3)!;
    const p = new Vector3(wall.x, 0.85, wall.z);
    cm.resolve(p, 0.4);
    const inside = Math.abs(p.x - wall.x) < wall.w / 2 && Math.abs(p.z - wall.z) < wall.d / 2;
    expect(inside).toBe(false);
  });
});
