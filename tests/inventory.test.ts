import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/player/Inventory';
import { stashInto, weightOf } from '../src/player/Stacks';
import { Stack } from '../src/data/items';

describe('Behälter und Gewicht', () => {
  it('stapelt bis maxStack und öffnet dann neue Stacks', () => {
    const inv = new Inventory(100);
    expect(inv.add('water', 6)).toBe(0); // maxStack 4
    expect(inv.list('main').map((s) => s.qty)).toEqual([4, 2]);
  });

  it('respektiert die Tragkraft und gibt den Rest zurück', () => {
    const inv = new Inventory(3);
    expect(inv.add('wood', 3)).toBe(1); // 1.5 kg pro Stück
    expect(inv.weight).toBe(3);
  });

  it('wird ab 70 % Last langsamer, nie unter 70 % Tempo', () => {
    const inv = new Inventory(10);
    expect(inv.speedFactor).toBe(1);
    inv.add('wood', 5); // 7.5 kg = 75 %
    expect(inv.speedFactor).toBeLessThan(1);
    expect(inv.speedFactor).toBeGreaterThanOrEqual(0.7);
  });

  it('der Rucksack-Behälter hat ohne Rucksack keinen Platz', () => {
    const inv = new Inventory(14);
    expect(inv.hasBag).toBe(false);
    expect(inv.addTo('bag', 'apple', 1)).toBe(1);
    expect(inv.add('apple', 2)).toBe(0);
    expect(inv.list('main')[0].qty).toBe(2);
  });

  it('Rucksack: eigener Behälter, Inhalt wiegt weniger gegen die Tragkraft', () => {
    const inv = new Inventory(14);
    inv.wear('hikingpack'); // fasst 50 kg (+ 4 kg Seitentaschen), Inhalt −50 %
    expect(inv.capacity('bag')).toBe(50);
    expect(inv.capacity('side')).toBe(4);
    expect(inv.addTo('bag', 'wood', 5)).toBe(0); // 7.5 kg echt
    expect(inv.rawWeight('bag')).toBe(7.5);
    expect(inv.weight).toBe(3.75); // zählt zur Hälfte
    expect(inv.count('wood')).toBe(5);
  });

  it('Seitentaschen sind ein eigener Behälter des Rucksacks und fallen ohne Rucksack weg', () => {
    const inv = new Inventory(14);
    expect(inv.capacity('side')).toBe(0);
    expect(inv.addTo('side', 'apple', 1)).toBe(1);
    inv.wear('schoolbag'); // 2 kg Seitentaschen
    expect(inv.addTo('side', 'wood', 5)).toBe(5 - 1); // 1 × 1.5 kg passt, 2 × 1.5 nicht
    expect(inv.list('side')[0].qty).toBe(1);
    expect(inv.stacks.length).toBe(1);
    expect(inv.weight).toBeCloseTo(1.5 * 0.75, 1);
    inv.unequip('back'); // Inhalt wandert in die Taschen
    expect(inv.list('side').length).toBe(0);
    expect(inv.count('wood')).toBe(1);
  });

  it('Rucksack ist an seine Kapazität gebunden', () => {
    const inv = new Inventory(100);
    inv.wear('schoolbag'); // 50 kg
    expect(inv.addTo('bag', 'wood', 40)).toBe(40 - 33); // 33 × 1.5 = 49.5 kg
  });

  it('add bevorzugt den gewünschten Behälter und läuft in den anderen über', () => {
    const inv = new Inventory(14);
    inv.wear('schoolbag');
    inv.add('wood', 1, 'bag');
    expect(inv.list('bag')[0].id).toBe('wood');
    expect(inv.list('main').length).toBe(0);
  });

  it('move verschiebt zwischen Körper und Rucksack', () => {
    const inv = new Inventory(14);
    inv.wear('schoolbag');
    inv.add('apple', 4);
    expect(inv.move('main', 0, 'bag', 3)).toBe(3);
    expect(inv.list('main')[0].qty).toBe(1);
    expect(inv.list('bag')[0].qty).toBe(3);
    expect(inv.move('bag', 0, 'bag')).toBe(0);
  });

  it('move legt zurück, wenn es nicht hineinpasst', () => {
    const inv = new Inventory(100);
    inv.wear('schoolbag');
    inv.addTo('bag', 'wood', 33); // 49,5 von 50 kg
    inv.add('wood', 2);
    expect(inv.move('main', 0, 'bag')).toBe(0);
    expect(inv.count('wood')).toBe(35);
  });

  it('find und removeAt arbeiten über beide Behälter', () => {
    const inv = new Inventory(14);
    inv.wear('schoolbag');
    inv.addTo('bag', 'bar', 2);
    inv.addTo('main', 'apple', 1);
    expect(inv.find('bar')).toEqual({ where: 'bag', index: 0 });
    expect(inv.find('apple')).toEqual({ where: 'main', index: 0 });
    expect(inv.removeAt(1, 1)).toBe(true); // erster Stack im Rucksack
    expect(inv.count('bar')).toBe(1);
  });

  it('sortiert einen Behälter und führt Stacks zusammen', () => {
    const inv = new Inventory(100);
    inv.addTo('main', 'wood', 1);
    inv.addTo('main', 'apple', 2);
    inv.list('main').push({ id: 'apple', qty: 3 }, { id: 'water', qty: 1 });
    inv.sort('main');
    expect(inv.list('main').map((s) => s.id)).toEqual(['water', 'apple', 'wood']);
    expect(inv.count('apple')).toBe(5);
  });
});

describe('Ausrüstung', () => {
  it('Rucksack anziehen: Item kommt aus der Liste, Behälter wird nutzbar', () => {
    const inv = new Inventory(14);
    inv.add('schoolbag', 1);
    expect(inv.equip('main', 0).ok).toBe(true);
    expect(inv.equipment.back).toBe('schoolbag');
    expect(inv.hasBag).toBe(true);
    expect(inv.stacks.length).toBe(0);
  });

  it('tauscht Rucksäcke: Inhalt zieht um, der alte kommt in die Taschen', () => {
    const inv = new Inventory(14);
    inv.wear('schoolbag');
    inv.addTo('bag', 'apple', 3);
    inv.add('hikingpack', 1);
    const at = inv.find('hikingpack')!;
    expect(inv.equip(at.where, at.index).ok).toBe(true);
    expect(inv.equipment.back).toBe('hikingpack');
    expect(inv.count('schoolbag')).toBe(1);
    expect(inv.list('bag').find((s) => s.id === 'apple')?.qty).toBe(3);
  });

  it('verweigert das Ablegen, wenn der Inhalt nicht in die Taschen passt', () => {
    const inv = new Inventory(4);
    inv.wear('schoolbag');
    // im Rucksack zählt Holz ×0.75: bei 4 kg Tragkraft passen 3 Stück hinein (4.5 kg echt)
    expect(inv.addTo('bag', 'wood', 6)).toBe(3);
    // in den Taschen (ohne Rabatt) würden nur 2 hineinpassen
    expect(inv.unequip('back').ok).toBe(false);
    expect(inv.equipment.back).toBe('schoolbag');
    expect(inv.list('bag')[0].qty).toBe(3);
  });

  it('Ablegen packt den Inhalt in die Taschen, wenn es passt', () => {
    const inv = new Inventory(14);
    inv.wear('schoolbag');
    inv.addTo('bag', 'apple', 2);
    expect(inv.unequip('back').ok).toBe(true);
    expect(inv.hasBag).toBe(false);
    expect(inv.count('apple')).toBe(2);
    expect(inv.count('schoolbag')).toBe(1);
  });

  it('Kleidung wärmt, Taschenlampe gibt Licht', () => {
    const inv = new Inventory(14);
    inv.wear('jacket');
    inv.wear('beanie');
    inv.wear('flashlight');
    expect(inv.warmth).toBeCloseTo(0.45);
    expect(inv.hasLight).toBe(true);
  });

  it('nur passende Teile lassen sich anlegen', () => {
    const inv = new Inventory(14);
    inv.add('apple', 1);
    expect(inv.equip('main', 0).ok).toBe(false);
  });

  it('hasTag findet getragene und eingepackte Items', () => {
    const inv = new Inventory(14);
    expect(inv.hasTag('light')).toBe(false);
    inv.wear('flashlight');
    expect(inv.hasTag('light')).toBe(true);
    inv.add('wood', 1);
    expect(inv.hasTag('fuel')).toBe(true);
  });
});

describe('Behälter in der Welt', () => {
  it('stapelt zuerst auf und kennt kein Platzlimit', () => {
    const loot: Stack[] = [{ id: 'apple', qty: 6 }];
    stashInto(loot, 'apple', 4);
    expect(loot).toEqual([{ id: 'apple', qty: 8 }, { id: 'apple', qty: 2 }]);
    stashInto(loot, 'wood', 12);
    expect(loot.filter((s) => s.id === 'wood').reduce((n, s) => n + s.qty, 0)).toBe(12);
  });

  it('weightOf summiert das Gewicht', () => {
    expect(weightOf([{ id: 'wood', qty: 2 }, { id: 'apple', qty: 5 }])).toBe(4);
  });
});
