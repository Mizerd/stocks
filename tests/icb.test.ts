import { describe, expect, it } from 'vitest';
import { BALTIC_SUPERSECTOR_ICB, ICB_SECTOR, SECTOR_ICB, US_INDUSTRY_ICB, US_TICKER_ICB, usIndustryKey } from '../shared/icb';
import en from '../src/i18n/en/heatmap.json';
import lt from '../src/i18n/lt/heatmap.json';

describe('industry keys', () => {
  const keys = [...Object.values(US_INDUSTRY_ICB), ...Object.values(US_TICKER_ICB), ...Object.values(BALTIC_SUPERSECTOR_ICB)];

  it('have a label in both languages', () => {
    for (const key of new Set(keys)) {
      expect(en.icb, key).toHaveProperty(key);
      expect(lt.icb, key).toHaveProperty(key);
    }
    expect(Object.keys(lt.icb).sort()).toEqual(Object.keys(en.icb).sort());
  });

  it('all belong to a site sector', () => {
    for (const key of [...keys, ...Object.keys(en.icb), ...Object.values(SECTOR_ICB)]) expect(ICB_SECTOR[key.slice(0, 2)], key).toBeDefined();
  });

  it('map Nasdaq\'s US industries, with overrides by symbol and the sector as the fallback', () => {
    expect(usIndustryKey('Semiconductors', 'NVDA', 'T')).toBe('10102010');
    expect(usIndustryKey('Business Services', 'V', 'D')).toBe('3020');
    expect(usIndustryKey('Something new', 'XYZ', 'H')).toBe('20');
    expect(usIndustryKey('', 'XYZ', undefined)).toBeUndefined();
  });
});
