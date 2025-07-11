import { describe, it, expect } from '@jest/globals';
import { getObjectClassesHandler } from './getObjectClasses.js';

describe('getObjectClassesHandler', () => {
  it('should return all object classes when no filters provided', async () => {
    const result = await getObjectClassesHandler({});
    
    expect(result.content).toHaveLength(1);
    const response = JSON.parse(result.content[0].text as string) as Record<string, unknown>;
    
    expect(response.totalClasses).toBe(172); // Total S-57 object classes
    expect(response.objectClasses).toHaveLength(172);
    expect(response.categories).toContain('navAids');
    expect(response.categories).toContain('depths');
    expect(response.categories).toContain('areas');
  });

  it('should filter by category', async () => {
    const result = await getObjectClassesHandler({ category: 'navAids' });
    
    const response = JSON.parse(result.content[0].text as string) as Record<string, unknown>;
    
    expect(response.totalClasses).toBe(23); // Navigation aids count
    expect((response.objectClasses as Array<{category: string}>).every((oc) => oc.category === 'navAids')).toBe(true);
    
    // Check for specific navigation aids
    const acronyms = (response.objectClasses as Array<{acronym: string}>).map((oc) => oc.acronym);
    expect(acronyms).toContain('LIGHTS');
    expect(acronyms).toContain('BOYLAT');
    expect(acronyms).toContain('BCNCAR');
  });

  it('should search by acronym', async () => {
    const result = await getObjectClassesHandler({ search: 'LIGHT' });
    
    const response = JSON.parse(result.content[0].text as string) as Record<string, unknown>;
    
    // Should find LIGHTS, LITFLT, LITVES
    expect(response.totalClasses).toBeGreaterThanOrEqual(3);
    
    const acronyms = (response.objectClasses as Array<{acronym: string}>).map((oc) => oc.acronym);
    expect(acronyms).toContain('LIGHTS');
    expect(acronyms).toContain('LITFLT');
    expect(acronyms).toContain('LITVES');
  });

  it('should search by description', async () => {
    const result = await getObjectClassesHandler({ search: 'buoy' });
    
    const response = JSON.parse(result.content[0].text as string) as Record<string, unknown>;
    
    // Should find all buoy types
    expect(response.totalClasses).toBeGreaterThanOrEqual(6);
    
    const descriptions = (response.objectClasses as Array<{description: string}>).map((oc) => oc.description.toLowerCase());
    expect(descriptions.every((d: string) => d.includes('buoy'))).toBe(true);
  });

  it('should include attributes when requested', async () => {
    const result = await getObjectClassesHandler({ 
      search: 'LIGHTS',
      includeAttributes: true 
    });
    
    const response = JSON.parse(result.content[0].text as string) as Record<string, unknown>;
    
    const lights = (response.objectClasses as Array<{acronym: string; attributes?: string[]}>).find((oc) => oc.acronym === 'LIGHTS');
    expect(lights).toBeDefined();
    expect(lights?.attributes).toBeDefined();
    expect(lights?.attributes).toContain('LITCHR');
    expect(lights?.attributes).toContain('SIGPER');
    expect(lights?.attributes).toContain('COLOUR');
    expect(lights?.attributes).toContain('VALNMR');
  });

  it('should include navigation significance for key features', async () => {
    const result = await getObjectClassesHandler({ search: 'DEPARE' });
    
    const response = JSON.parse(result.content[0].text as string) as Record<string, unknown>;
    
    const depare = (response.objectClasses as Array<{acronym: string; navigationSignificance?: string}>).find((oc) => oc.acronym === 'DEPARE');
    expect(depare).toBeDefined();
    expect(depare?.navigationSignificance).toBeDefined();
    expect(depare?.navigationSignificance).toContain('depth ranges');
    expect(depare?.navigationSignificance).toContain('draft restrictions');
  });

  it('should handle combined filters', async () => {
    const result = await getObjectClassesHandler({ 
      category: 'depths',
      includeAttributes: true 
    });
    
    const response = JSON.parse(result.content[0].text as string) as Record<string, unknown>;
    
    expect(response.totalClasses).toBe(6); // Depth features count
    expect((response.objectClasses as Array<{category: string}>).every((oc) => oc.category === 'depths')).toBe(true);
    
    // Check that depth features have attributes
    const depare = (response.objectClasses as Array<{acronym: string; attributes?: string[]}>).find((oc) => oc.acronym === 'DEPARE');
    expect(depare?.attributes).toContain('DRVAL1');
    expect(depare?.attributes).toContain('DRVAL2');
  });

  it('should return object classes sorted by code', async () => {
    const result = await getObjectClassesHandler({ category: 'navAids' });
    
    const response = JSON.parse(result.content[0].text as string) as Record<string, unknown>;
    
    // Check that codes are in ascending order
    const codes = (response.objectClasses as Array<{code: number}>).map((oc) => oc.code);
    const sortedCodes = [...codes].sort((a, b) => a - b);
    expect(codes).toEqual(sortedCodes);
  });

  it('should handle empty search results gracefully', async () => {
    const result = await getObjectClassesHandler({ search: 'NONEXISTENT' });
    
    const response = JSON.parse(result.content[0].text as string) as Record<string, unknown>;
    
    expect(response.totalClasses).toBe(0);
    expect(response.objectClasses).toHaveLength(0);
  });

  it('should include all primitive types', async () => {
    const result = await getObjectClassesHandler({ search: 'BRIDGE' });
    
    const response = JSON.parse(result.content[0].text as string) as Record<string, unknown>;
    
    const bridge = (response.objectClasses as Array<{acronym: string; primitives?: string[]}>).find((oc) => oc.acronym === 'BRIDGE');
    expect(bridge).toBeDefined();
    expect(bridge?.primitives).toContain('Point');
    expect(bridge?.primitives).toContain('Line');
    expect(bridge?.primitives).toContain('Area');
  });
});