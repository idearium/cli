'use strict';

// Behavior tests for the c.js contract editors (addKeyToEntryInCjs,
// setOpItemInCjs, registerServiceInCjs) over adversarial c.js fixtures.
//
// Every fixture is a valid c.js module; every edit must leave a file that
// still parses, still validates as a contract, preserves the user's
// comments, array style and line endings, and is idempotent.
//
// Run with: npm test

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const prettier = require('prettier');

const io = require('../bin/lib/c-secrets-io.js');
const { getSecretsContract } = require('../bin/lib/c-secrets.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const PRETTIER_OPTIONS = Object.assign(
    { endOfLine: 'lf', parser: 'babel' },
    JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, '.prettierrc.json'), 'utf8')
    )
);

const isPrettierClean = (text) =>
    prettier.format(text, PRETTIER_OPTIONS) === text;

const isCrlf = (text) => {
    const lines = text.split('\n');

    return lines.slice(0, -1).every((line) => line.endsWith('\r'));
};

// The c.js preamble every fixture shares (a docker decoy site, a valid
// project and gcloud block, and a secrets contract).
const preamble = () => `module.exports = {
    project: {
        gcpProjectId: 'demo-proj',
        name: 'demo',
        organisation: 'idearium',
    },
    gcloud: {
        projectId: 'demo-proj',
        region: 'australia-southeast1',
    },
    docker: {
        locations: {
            site: { buildArgs: { TOKEN: 'nope' } },
        },
    },
    secrets: {
`;

const closing = () => `    },
};
`;

const loadCjs = () => {
    const file = path.resolve(process.cwd(), 'c.js');

    delete require.cache[require.resolve(file)];

    return require(file);
};

const readCjs = () =>
    fs.readFileSync(path.resolve(process.cwd(), 'c.js'), 'utf8');

const writeCjs = (text) =>
    fs.writeFileSync(path.resolve(process.cwd(), 'c.js'), text);

// Run a test body inside a temp directory holding the fixture c.js.
const withFixture = (name, cjsText, body) =>
    test(name, () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cjs-editors-'));
        const previousCwd = process.cwd();

        process.chdir(dir);
        writeCjs(cjsText);

        try {
            body();
        } finally {
            process.chdir(previousCwd);
            fs.rmSync(dir, { force: true, recursive: true });
        }
    });

// The key-array styles addKeyToEntryInCjs must survive. Each style pins
// the exact block the keys property must render as after adding one key,
// so formatting (indentation, separators, trailing commas) is asserted,
// not just parseability.
const KEY_STYLES = [
    {
        // The style `c secrets init` drafts (and the style that shipped
        // broken): multi-line with trailing commas.
        expectedSharedBlock: `            keys: [
                'API_TOKEN',
                'IMGIX_TOKEN',
            ],`,
        expectedSiteBlock: `                keys: [
                    'CACHE_URL',
                    'RAS_API_KEY',
                ],`,
        existingSharedKeys: ['IMGIX_TOKEN'],
        existingSiteKeys: ['CACHE_URL'],
        label: 'multi-line keys with trailing commas (init style)',
        shared: `        shared: {
            keys: [
                'IMGIX_TOKEN',
            ],
        },
`,
        site: `            site: {
                opItem: 'aaaa',
                keys: [
                    'CACHE_URL',
                ],
            },
`,
    },
    {
        expectedSharedBlock: `            keys: [
                'API_TOKEN',
                'IMGIX_TOKEN'
            ]`,
        expectedSiteBlock: `                keys: [
                    'CACHE_URL',
                    'RAS_API_KEY'
                ]`,
        existingSharedKeys: ['IMGIX_TOKEN'],
        existingSiteKeys: ['CACHE_URL'],
        label: 'multi-line keys without trailing commas',
        shared: `        shared: {
            keys: [
                'IMGIX_TOKEN'
            ]
        },
`,
        site: `            site: {
                opItem: 'aaaa',
                keys: [
                    'CACHE_URL'
                ]
            },
`,
    },
    {
        canonical: true,
        expectedSharedBlock: `            keys: ['API_TOKEN', 'IMGIX_TOKEN'],`,
        expectedSiteBlock: `                keys: ['CACHE_URL', 'RAS_API_KEY'],`,
        existingSharedKeys: ['IMGIX_TOKEN'],
        existingSiteKeys: ['CACHE_URL'],
        label: 'single-line keys',
        shared: `        shared: {
            keys: ['IMGIX_TOKEN'],
        },
`,
        site: `            site: {
                opItem: 'aaaa',
                keys: ['CACHE_URL'],
            },
`,
    },
    {
        canonical: true,
        expectedSharedBlock: `            keys: ['API_TOKEN'],`,
        expectedSiteBlock: `                keys: ['RAS_API_KEY'],`,
        existingSharedKeys: [],
        existingSiteKeys: [],
        label: 'empty single-line keys',
        shared: `        shared: {
            keys: [],
        },
`,
        site: `            site: {
                opItem: 'aaaa',
                keys: [],
            },
`,
    },
    {
        expectedSharedBlock: `            keys: [
                'API_TOKEN',
            ],`,
        expectedSiteBlock: `                keys: [
                    'RAS_API_KEY',
                ],`,
        existingSharedKeys: [],
        existingSiteKeys: [],
        label: 'empty multi-line keys',
        shared: `        shared: {
            keys: [
            ],
        },
`,
        site: `            site: {
                opItem: 'aaaa',
                keys: [
                ],
            },
`,
    },
];

const fixtureFor = (style) =>
    `${preamble()}        services: {
${style.site}        },
${style.shared}${closing()}`;

KEY_STYLES.forEach((style) => {
    const fixture = fixtureFor(style);

    withFixture(
        `addKeyToEntryInCjs adds and sorts a service key: ${style.label}`,
        fixture,
        () => {
            io.addKeyToEntryInCjs({ key: 'RAS_API_KEY', name: 'site' });

            const config = loadCjs();

            assert.deepEqual(
                config.secrets.services.site.keys,
                style.existingSiteKeys.concat('RAS_API_KEY')
            );
            assert.equal(config.docker.locations.site.buildArgs.TOKEN, 'nope');

            const text = readCjs();

            assert.ok(
                text.includes(style.expectedSiteBlock),
                'the keys block must render in the entry\u2019s own style'
            );

            if (style.canonical) {
                assert.equal(isPrettierClean(text), true);
            }

            // Idempotent: a second identical run changes nothing.
            const afterFirst = readCjs();

            io.addKeyToEntryInCjs({ key: 'RAS_API_KEY', name: 'site' });

            assert.equal(readCjs(), afterFirst);
        }
    );

    withFixture(
        `addKeyToEntryInCjs adds a shared key: ${style.label}`,
        fixture,
        () => {
            io.addKeyToEntryInCjs({ key: 'API_TOKEN', name: 'shared' });

            const config = loadCjs();

            assert.deepEqual(
                config.secrets.shared.keys,
                style.existingSharedKeys.concat('API_TOKEN').sort()
            );

            assert.ok(
                readCjs().includes(style.expectedSharedBlock),
                'the shared keys block must render in the entry\u2019s own style'
            );
        }
    );
});

withFixture(
    'addKeyToEntryInCjs preserves comments inside the contract',
    `${preamble()}        services: {
            site: {
                // the site's owned keys
                keys: [
                    // cache connection details
                    'CACHE_URL',
                ],
            },
        },
        shared: {
            keys: ['IMGIX_TOKEN'],
        },
${closing()}`,
    () => {
        io.addKeyToEntryInCjs({ key: 'RAS_API_KEY', name: 'site' });

        const config = loadCjs();
        const text = readCjs();

        assert.deepEqual(config.secrets.services.site.keys, [
            'CACHE_URL',
            'RAS_API_KEY',
        ]);
        assert.match(text, /\/\/ the site's owned keys/);
        assert.match(text, /\/\/ cache connection details/);
    }
);

withFixture(
    'addKeyToEntryInCjs creates a missing keys array',
    `${preamble()}        services: {
            'prismic-published-workflow': {
                sharedKeys: ['IMGIX_TOKEN'],
            },
        },
        shared: {
            keys: ['IMGIX_TOKEN'],
        },
${closing()}`,
    () => {
        io.addKeyToEntryInCjs({
            key: 'BASIC_AUTH',
            name: 'prismic-published-workflow',
        });

        const config = loadCjs();

        assert.deepEqual(
            config.secrets.services['prismic-published-workflow'].keys,
            ['BASIC_AUTH']
        );
        assert.deepEqual(
            config.secrets.services['prismic-published-workflow'].sharedKeys,
            ['IMGIX_TOKEN']
        );
        assert.equal(isPrettierClean(readCjs()), true);
    }
);

withFixture(
    'addKeyToEntryInCjs preserves CRLF line endings',
    fixtureFor(KEY_STYLES[2]).replace(/\n/g, '\r\n'),
    () => {
        io.addKeyToEntryInCjs({ key: 'RAS_API_KEY', name: 'site' });

        const config = loadCjs();

        assert.deepEqual(config.secrets.services.site.keys, [
            'CACHE_URL',
            'RAS_API_KEY',
        ]);
        assert.equal(isCrlf(readCjs()), true, 'no mixed line endings');
    }
);

withFixture(
    'addKeyToEntryInCjs result still validates as a contract',
    fixtureFor(KEY_STYLES[0]),
    () => {
        io.addKeyToEntryInCjs({ key: 'RAS_API_KEY', name: 'site' });

        const contract = getSecretsContract({ config: loadCjs() });
        const { site } = contract.services;

        assert.equal(site.name, 'site');
        assert.deepEqual(site.keys, ['CACHE_URL', 'RAS_API_KEY']);
        assert.equal(site.opItem, 'aaaa');
    }
);

withFixture(
    'setOpItemInCjs binds an absent opItem',
    `${preamble()}        services: {
            site: {
                keys: ['CACHE_URL'],
            },
        },
        shared: {
            keys: ['IMGIX_TOKEN'],
        },
${closing()}`,
    () => {
        io.setOpItemInCjs({ name: 'site', opItem: 'bbbb' });

        assert.equal(loadCjs().secrets.services.site.opItem, 'bbbb');
        assert.equal(isPrettierClean(readCjs()), true);
    }
);

withFixture(
    'setOpItemInCjs binds an absent shared opItem',
    `${preamble()}        services: {
            site: {
                opItem: 'aaaa',
                keys: ['CACHE_URL'],
            },
        },
        shared: {
            keys: ['IMGIX_TOKEN'],
        },
${closing()}`,
    () => {
        io.setOpItemInCjs({ name: 'shared', opItem: 'services.site' });

        const config = loadCjs();

        assert.equal(config.secrets.shared.opItem, 'services.site');
        assert.equal(config.secrets.services.site.opItem, 'aaaa');
    }
);

withFixture(
    'setOpItemInCjs is a no-op when already bound',
    `${preamble()}        services: {
            site: {
                opItem: 'aaaa',
                keys: ['CACHE_URL'],
            },
        },
        shared: {
            keys: ['IMGIX_TOKEN'],
        },
${closing()}`,
    () => {
        const before = readCjs();

        io.setOpItemInCjs({ name: 'site', opItem: 'zzzz' });

        assert.equal(readCjs(), before);
        assert.equal(loadCjs().secrets.services.site.opItem, 'aaaa');
    }
);

withFixture(
    'setOpItemInCjs preserves CRLF line endings',
    `${preamble()}        services: {
            site: {
                keys: ['CACHE_URL'],
            },
        },
        shared: {
            keys: ['IMGIX_TOKEN'],
        },
${closing()}`.replace(/\n/g, '\r\n'),
    () => {
        io.setOpItemInCjs({ name: 'site', opItem: 'bbbb' });

        assert.equal(loadCjs().secrets.services.site.opItem, 'bbbb');
        assert.equal(isCrlf(readCjs()), true, 'no mixed line endings');
    }
);

withFixture(
    'registerServiceInCjs inserts alphabetically before existing services',
    `${preamble()}        services: {
            site: {
                opItem: 'aaaa',
                keys: ['CACHE_URL'],
            },
        },
        shared: {
            keys: ['IMGIX_TOKEN'],
        },
${closing()}`,
    () => {
        io.registerServiceInCjs({ key: 'TOKEN', name: 'api', opItem: 'cccc' });

        const config = loadCjs();

        assert.deepEqual(Object.keys(config.secrets.services), ['api', 'site']);
        assert.deepEqual(config.secrets.services.api.keys, ['TOKEN']);
        assert.equal(config.secrets.services.api.opItem, 'cccc');
        assert.equal(isPrettierClean(readCjs()), true);
    }
);

withFixture(
    'registerServiceInCjs appends alphabetically last services',
    `${preamble()}        services: {
            site: {
                opItem: 'aaaa',
                keys: ['CACHE_URL'],
            },
        },
        shared: {
            keys: ['IMGIX_TOKEN'],
        },
${closing()}`,
    () => {
        io.registerServiceInCjs({ key: 'TOKEN', name: 'www', opItem: 'dddd' });

        const config = loadCjs();

        assert.deepEqual(Object.keys(config.secrets.services), ['site', 'www']);
        assert.deepEqual(config.secrets.services.www.keys, ['TOKEN']);
        assert.equal(config.secrets.services.www.opItem, 'dddd');
        assert.equal(isPrettierClean(readCjs()), true);
    }
);

withFixture(
    'registerServiceInCjs inserts alongside quoted service names',
    `${preamble()}        services: {
            'prismic-published-workflow': {
                sharedKeys: ['IMGIX_TOKEN'],
            },
        },
        shared: {
            keys: ['IMGIX_TOKEN'],
        },
${closing()}`,
    () => {
        io.registerServiceInCjs({ key: 'TOKEN', name: 'api', opItem: 'cccc' });

        const config = loadCjs();

        assert.deepEqual(Object.keys(config.secrets.services), [
            'api',
            'prismic-published-workflow',
        ]);
        assert.deepEqual(config.secrets.services.api.keys, ['TOKEN']);
        assert.equal(config.secrets.services.api.opItem, 'cccc');
    }
);

withFixture(
    'registerServiceInCjs expands an empty services scaffold',
    `${preamble()}        services: {},
        shared: {
            keys: ['IMGIX_TOKEN'],
        },
${closing()}`,
    () => {
        io.registerServiceInCjs({ key: 'TOKEN', name: 'api', opItem: 'cccc' });

        const config = loadCjs();

        assert.deepEqual(config.secrets.services.api.keys, ['TOKEN']);
        assert.equal(config.secrets.services.api.opItem, 'cccc');
        assert.equal(isPrettierClean(readCjs()), true);
    }
);

withFixture(
    'registerServiceInCjs result still validates as a contract',
    `${preamble()}        services: {},
        shared: {
            keys: ['IMGIX_TOKEN'],
        },
${closing()}`,
    () => {
        io.registerServiceInCjs({ key: 'TOKEN', name: 'api', opItem: 'cccc' });

        const contract = getSecretsContract({ config: loadCjs() });

        assert.deepEqual(contract.services.api.keys, ['TOKEN']);
        assert.equal(contract.services.api.opItem, 'cccc');
    }
);
