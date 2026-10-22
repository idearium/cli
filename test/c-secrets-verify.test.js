'use strict';

// Behavioral tests for the deployed-function secret-reference findings:
// where the naming convention encodes an env in a function name
// ({org}-{repo}-{env}-{name}), the env in every repo-prefixed secret id
// the function references must agree (MISBOUND otherwise); names without
// a parseable env keep id-only validation behind an advisory; and
// contract ids must exist in GSM (MISSING) or be reported stale (STALE).
//
// Run with: npm test

import { expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
    functionReferenceFindings,
    parseNameEnv,
} = require('../bin/lib/c-secrets-verify.js');

const ENVS = ['beta', 'local', 'production'];
const PREFIX = 'idearium-demo-';

const BETA_ID = 'idearium-demo-beta-site-cache-url';
const PRODUCTION_ID = 'idearium-demo-production-site-cache-url';

const derivedByEnv = {
    beta: new Set([BETA_ID]),
    local: new Set(['idearium-demo-local-site-cache-url']),
    production: new Set([PRODUCTION_ID]),
};

const findingsOf = ({ existing = [], fn }) =>
    functionReferenceFindings({
        derivedByEnv,
        envs: ENVS,
        existingIds: new Set(existing),
        fn,
        repoPrefix: PREFIX,
    });

it('parses the env out of a convention name', () => {
    expect(
        parseNameEnv({
            envs: ENVS,
            name: 'idearium-demo-beta-images',
            prefix: PREFIX,
        })
    ).toBe('beta');

    expect(
        parseNameEnv({
            envs: ENVS,
            name: 'idearium-demo-production-prismic-published',
            prefix: PREFIX,
        })
    ).toBe('production');
});

it('does not parse lookalike or legacy names', () => {
    expect(
        parseNameEnv({
            envs: ENVS,
            name: 'idearium-demo-betamax-images',
            prefix: PREFIX,
        })
    ).toBe(null);

    expect(
        parseNameEnv({
            envs: ENVS,
            name: 'idearium-demo-prismic-published',
            prefix: PREFIX,
        })
    ).toBe(null);
});

it('reports a contract id of the function env that exists', () => {
    const findings = findingsOf({
        existing: [BETA_ID],
        fn: {
            name: 'idearium-demo-beta-images',
            secrets: [BETA_ID],
        },
    });

    expect(findings).toStrictEqual([
        {
            advisory: false,
            message: `function idearium-demo-beta-images -> ${BETA_ID}`,
            ok: true,
        },
    ]);
});

it('reports a contract id of the function env that is gone from GSM', () => {
    const findings = findingsOf({
        fn: {
            name: 'idearium-demo-beta-images',
            secrets: [BETA_ID],
        },
    });

    expect(findings).toStrictEqual([
        {
            advisory: false,
            message: `MISSING  function idearium-demo-beta-images -> ${BETA_ID} (contract id, but the GSM secret does not exist)`,
            ok: false,
        },
    ]);
});

it('reports a non-contract id as stale, noting an unparsed env', () => {
    const findings = findingsOf({
        existing: ['idearium-demo-functions-imgix-token'],
        fn: {
            name: 'idearium-demo-beta-images',
            secrets: ['idearium-demo-functions-imgix-token'],
        },
    });

    expect(findings).toStrictEqual([
        {
            advisory: false,
            message:
                'STALE   function idearium-demo-beta-images -> ' +
                'idearium-demo-functions-imgix-token (unknown env) ' +
                '(not in contract)',
            ok: false,
        },
    ]);
});

it('reports a cross-env reference as misbound', () => {
    const findings = findingsOf({
        existing: [PRODUCTION_ID],
        fn: {
            name: 'idearium-demo-beta-images',
            secrets: [PRODUCTION_ID],
        },
    });

    expect(findings).toStrictEqual([
        {
            advisory: false,
            message: `MISBOUND function idearium-demo-beta-images -> ${PRODUCTION_ID} (name env beta, id env production)`,
            ok: false,
        },
    ]);
});

it('misbinding outranks existence checks', () => {
    const findings = findingsOf({
        fn: {
            name: 'idearium-demo-beta-images',
            secrets: ['idearium-demo-production-gone-secret'],
        },
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ok).toBe(false);
    expect(findings[0].message).toContain('MISBOUND');
});

it('keeps id-only validation behind an advisory for names without an env', () => {
    const findings = findingsOf({
        existing: [BETA_ID],
        fn: {
            name: 'idearium-demo-images',
            secrets: [BETA_ID, 'an-unprefixed-id'],
        },
    });

    expect(findings).toStrictEqual([
        {
            advisory: true,
            message:
                'function idearium-demo-images: no environment parsed from ' +
                'the name - validating references by secret id only',
            ok: true,
        },
        {
            advisory: false,
            message: `function idearium-demo-images -> ${BETA_ID}`,
            ok: true,
        },
    ]);
});

it('reports no problems for a clean same-env function', () => {
    const findings = findingsOf({
        existing: [BETA_ID, PRODUCTION_ID],
        fn: {
            name: 'idearium-demo-beta-images',
            secrets: [BETA_ID],
        },
    });

    expect(findings.filter(({ ok }) => !ok)).toStrictEqual([]);
});
