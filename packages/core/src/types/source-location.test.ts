import { describe, expect, it } from 'vitest';
import { formatSourceLocation, parseSourceLocation } from './source-location.js';

describe('source location', () => {
  it('round-trips a location', () => {
    const location = { file: 'src/app/checkout.component.html', line: 42, column: 8 };
    expect(parseSourceLocation(formatSourceLocation(location))).toEqual(location);
  });

  it('keeps colons that belong to the path', () => {
    // Windows paths carry a drive letter colon, so only the last two segments
    // may be read as coordinates.
    const parsed = parseSourceLocation('C:/Projets/app/page.html:12:4');

    expect(parsed).toEqual({ file: 'C:/Projets/app/page.html', line: 12, column: 4 });
  });

  it('returns null instead of throwing on anything malformed', () => {
    // The value crosses a build boundary and may have been mangled by tooling we
    // do not control. An unknown location must degrade, never crash a scan.
    for (const value of [null, undefined, '', 'nonsense', 'file.html', 'file.html:1', ':1:2', 'file.html:0:1']) {
      expect(parseSourceLocation(value), `expected null for ${JSON.stringify(value)}`).toBeNull();
    }
  });
});
