'use strict';

// Validation tests for the secrets contract itself (getSecretsContract):
// in particular the key charset - keys become GSM secret ids that may
// only hold letters, numbers, underscores and hyphens, so anything else
// must fail at load with a friendly message.

import { expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { getSecretsContract } = require('../bin/lib/c-secrets.js');

const base = () => ({
    gcloud: { region: 'australia-southeast1' },
    project: {
        gcpProjectId: 'demo-proj',
        name: 'demo',
        organisation: 'idearium',
    },
});

const contractWith = (secrets) =>
    getSecretsContract({
        config: Object.assign(base(), { secrets }),
    });

const messageOf = (fn) => {
    try {
        fn();
    } catch ({ message }) {
        return message;
    }

    return 'did not throw';
};

it('accepts letters, numbers and underscores in keys', () => {
    const contract = contractWith({
        services: {
            site: { keys: ['CACHE_URL', 'RAS_API_KEY_2'], sharedKeys: [] },
        },
        shared: { keys: ['IMGIX_TOKEN'] },
    });

    expect(contract.services.site.keys).toStrictEqual([
        'CACHE_URL',
        'RAS_API_KEY_2',
    ]);
});

it('rejects keys with characters outside the GSM id alphabet', () => {
    expect(
        messageOf(() =>
            contractWith({ services: { site: { keys: ['FOO#1'] } } })
        )
    ).toContain('letters, numbers, underscores and hyphens');

    expect(
        messageOf(() =>
            contractWith({ services: { site: { keys: ['FOO$BAR'] } } })
        )
    ).toContain('letters, numbers, underscores and hyphens');

    expect(
        messageOf(() =>
            contractWith({
                services: { site: { keys: [] } },
                shared: { keys: ['A]B'] },
            })
        )
    ).toContain('letters, numbers, underscores and hyphens');
});

it('rejects dots outside the dotted sharedKeys form', () => {
    expect(
        messageOf(() => contractWith({ services: { site: { keys: ['A.B'] } } }))
    ).toContain('dots are only valid');

    expect(
        messageOf(() =>
            contractWith({
                services: {
                    site: { keys: [], sharedKeys: ['owner.FOO#1'] },
                },
            })
        )
    ).toContain('dots are only valid');
});

it('rejects dotted sharedKeys with more than one dot', () => {
    // A second dot would silently truncate on split - 'a.b.c' would mean
    // owner 'a', key 'b'.
    expect(
        messageOf(() =>
            contractWith({
                services: { site: { keys: [], sharedKeys: ['a.b.c'] } },
            })
        )
    ).toContain('exactly one dot');

    // The likely real-world typo: mixing up the sharedKeys form with the
    // opItem reference form.
    expect(
        messageOf(() =>
            contractWith({
                services: {
                    site: { keys: [], sharedKeys: ['services.site.KEY'] },
                },
            })
        )
    ).toContain('exactly one dot');
});

it('accepts the dotted sharedKeys form for valid keys', () => {
    const contract = contractWith({
        services: {
            'other-service': { keys: ['IMGIX_TOKEN'], sharedKeys: [] },
            'site': { keys: [], sharedKeys: ['other-service.IMGIX_TOKEN'] },
        },
    });

    expect(contract.services.site.sharedKeys[0].key).toBe('IMGIX_TOKEN');
});

it('accepts hyphenated keys', () => {
    const contract = contractWith({
        services: { site: { keys: ['FOO-BAR'], sharedKeys: [] } },
    });

    expect(contract.services.site.keys).toStrictEqual(['FOO-BAR']);
});
