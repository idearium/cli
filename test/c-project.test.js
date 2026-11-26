'use strict';

// Behavioral tests for the version logic behind c project bump: a bump
// type that names a prerelease type picks it, one that names none keeps
// the type the current version already carries, and each prerelease bump
// type maps onto the increment semver understands.
//
// Run with: npm test

import { expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
    getBumpType,
    getPrereleaseIdentifier,
} = require('../bin/lib/c-project.js');

it('uses the prerelease type named by the bump type', () => {
    expect(
        getPrereleaseIdentifier({ currentVersion: '8.1.16', type: 'staging' })
    ).toBe('staging');

    expect(
        getPrereleaseIdentifier({
            currentVersion: '8.1.17-staging.1',
            type: 'beta',
        })
    ).toBe('beta');
});

it('keeps the prerelease type of the current version when the bump type names none', () => {
    expect(
        getPrereleaseIdentifier({
            currentVersion: '8.1.17-staging.1',
            type: 'prerelease',
        })
    ).toBe('staging');
});

it('falls back to alpha', () => {
    expect(
        getPrereleaseIdentifier({
            currentVersion: '8.1.16',
            type: 'prerelease',
        })
    ).toBe('alpha');
});

it.each([
    ['staging', 'prerelease'],
    ['stagingmajor', 'premajor'],
    ['stagingminor', 'preminor'],
    ['stagingpatch', 'prepatch'],
    ['betamajor', 'premajor'],
    ['alpha', 'prerelease'],
    ['patch', 'patch'],
    ['premajor', 'premajor'],
])('maps the %s bump type to the %s increment', (type, bumpType) => {
    expect(getBumpType({ type })).toBe(bumpType);
});
