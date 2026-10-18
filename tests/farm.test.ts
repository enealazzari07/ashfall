import { describe, expect, it } from 'vitest';
import { generateChunk } from '../src/world/CityGenerator';
import { FARM_BOX, farmAspect } from '../src/render/FarmAssets';

describe('Bauernhof', () => {
  const chunks = [] as ReturnType<typeof generateChunk>[];
  for (let cx = -6; cx <= 6; cx++) for (let cz = -6; cz <= 6; cz++) chunks.push(generateChunk(cx, cz));

  it('erzeugt Felder, Zäune und Scheunen mit gültigen Maßen', () => {
    const fields = chunks.flatMap((c) => c.fields);
    const fences = chunks.flatMap((c) => c.fences);
    expect(fields.length).toBeGreaterThan(0);
    expect(fences.length).toBeGreaterThan(0);
    expect(chunks.flatMap((c) => c.buildings).some((b) => b.kind === 'barn')).toBe(true);
    for (const f of fields) expect(f.w).toBeGreaterThan(0);
  });

  it('Säcke enthalten Mais', () => {
    const sacks = chunks.flatMap((c) => c.sacks);
    expect(sacks.length).toBeGreaterThan(0);
    for (const s of sacks) expect(s.loot.some((l) => l.id === 'corn')).toBe(true);
  });

  it('Bildausschnitte haben ein Seitenverhältnis', () => {
    for (const k of Object.keys(FARM_BOX)) expect(farmAspect(k)).toBeGreaterThan(0);
  });
});
