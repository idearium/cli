'use strict';

// Unit tests for parseGsmResponse: the parsed body for a success, an
// empty object for an empty body, and friendly errors for the failure
// and unparseable-success cases - gsmRequest's response handler relies
// on it to reject the promise instead of crashing inside an event
// handler.

import { expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { parseGsmResponse } = require('../bin/lib/c-secrets-io.js');

it('returns the parsed body for a successful response', () => {
    expect(
        parseGsmResponse({
            method: 'GET',
            path: '/secrets',
            raw: '{"secrets":[{"name":"projects/p/secrets/a"}]}',
            statusCode: 200,
        })
    ).toStrictEqual({
        secrets: [{ name: 'projects/p/secrets/a' }],
    });
});

it('returns an empty object for an empty body', () => {
    expect(
        parseGsmResponse({
            method: 'DELETE',
            path: '/secrets/x',
            raw: '',
            statusCode: 200,
        })
    ).toStrictEqual({});
});

it('throws the friendly failure error for non-2xx responses', () => {
    expect(() =>
        parseGsmResponse({
            method: 'GET',
            path: '/secrets/x',
            raw: 'not found',
            statusCode: 404,
        })
    ).toThrow('GSM GET /secrets/x failed (404)');
});

it('throws a friendly error for an unparseable 2xx body', () => {
    let message = 'did not throw';

    try {
        parseGsmResponse({
            method: 'GET',
            path: '/secrets',
            raw: '{"trunc',
            statusCode: 200,
        });
    } catch ({ message: thrown }) {
        message = thrown;
    }

    expect(message).toContain('unparseable response');
    expect(message).toContain('{"trunc');
    // A raw SyntaxError never escapes - that is the crash-class bug this
    // guards against.
    expect(message).not.toContain('Unexpected token');
});
