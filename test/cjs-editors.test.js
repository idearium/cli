'use strict';

// Behavior tests for the c.js contract editors (addKeyToEntryInCjs,
// setOpItemInCjs, registerServiceInCjs) over adversarial c.js fixtures.
//
// Every fixture is a valid c.js module; every edit must leave a file that
// still parses, still validates as a contract, preserves the user's
// comments, array style and line endings, and is idempotent.
//
// Run with: npm test

import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const prettier = require('prettier');

const io = require('../bin/lib/c-secrets-io.js');
const { getSecretsContract } = require('../bin/lib/c-secrets.js');

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
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
    it(name, () => {
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

            expect(config.secrets.services.site.keys).toStrictEqual(
                style.existingSiteKeys.concat('RAS_API_KEY')
            );
            expect(config.docker.locations.site.buildArgs.TOKEN).toBe('nope');

            const text = readCjs();

            expect(
                text,
                'the keys block must render in the entry\u2019s own style'
            ).toContain(style.expectedSiteBlock);

            if (style.canonical) {
                expect(isPrettierClean(text)).toBe(true);
            }

            // Idempotent: a second identical run changes nothing.
            const afterFirst = readCjs();

            io.addKeyToEntryInCjs({ key: 'RAS_API_KEY', name: 'site' });

            expect(readCjs()).toBe(afterFirst);
        }
    );

    withFixture(
        `addKeyToEntryInCjs adds a shared key: ${style.label}`,
        fixture,
        () => {
            io.addKeyToEntryInCjs({ key: 'API_TOKEN', name: 'shared' });

            const config = loadCjs();

            expect(config.secrets.shared.keys).toStrictEqual(
                style.existingSharedKeys.concat('API_TOKEN').sort()
            );

            expect(
                readCjs(),
                'the shared keys block must render in the entry\u2019s own style'
            ).toContain(style.expectedSharedBlock);
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

        expect(config.secrets.services.site.keys).toStrictEqual([
            'CACHE_URL',
            'RAS_API_KEY',
        ]);
        expect(text).toMatch(/\/\/ the site's owned keys/);
        expect(text).toMatch(/\/\/ cache connection details/);
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

        expect(
            config.secrets.services['prismic-published-workflow'].keys
        ).toStrictEqual(['BASIC_AUTH']);
        expect(
            config.secrets.services['prismic-published-workflow'].sharedKeys
        ).toStrictEqual(['IMGIX_TOKEN']);
        expect(isPrettierClean(readCjs())).toBe(true);
    }
);

withFixture(
    'addKeyToEntryInCjs preserves CRLF line endings',
    fixtureFor(KEY_STYLES[2]).replace(/\n/g, '\r\n'),
    () => {
        io.addKeyToEntryInCjs({ key: 'RAS_API_KEY', name: 'site' });

        const config = loadCjs();

        expect(config.secrets.services.site.keys).toStrictEqual([
            'CACHE_URL',
            'RAS_API_KEY',
        ]);
        expect(isCrlf(readCjs()), 'no mixed line endings').toBe(true);
    }
);

withFixture(
    'addKeyToEntryInCjs result still validates as a contract',
    fixtureFor(KEY_STYLES[0]),
    () => {
        io.addKeyToEntryInCjs({ key: 'RAS_API_KEY', name: 'site' });

        const { site } = getSecretsContract({ config: loadCjs() }).services;

        expect(site.name).toBe('site');
        expect(site.keys).toStrictEqual(['CACHE_URL', 'RAS_API_KEY']);
        expect(site.opItem).toBe('aaaa');
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

        expect(loadCjs().secrets.services.site.opItem).toBe('bbbb');
        expect(isPrettierClean(readCjs())).toBe(true);
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

        expect(config.secrets.shared.opItem).toBe('services.site');
        expect(config.secrets.services.site.opItem).toBe('aaaa');
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

        expect(readCjs()).toBe(before);
        expect(loadCjs().secrets.services.site.opItem).toBe('aaaa');
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

        expect(loadCjs().secrets.services.site.opItem).toBe('bbbb');
        expect(isCrlf(readCjs()), 'no mixed line endings').toBe(true);
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

        expect(Object.keys(config.secrets.services)).toStrictEqual([
            'api',
            'site',
        ]);
        expect(config.secrets.services.api.keys).toStrictEqual(['TOKEN']);
        expect(config.secrets.services.api.opItem).toBe('cccc');
        expect(isPrettierClean(readCjs())).toBe(true);
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

        expect(Object.keys(config.secrets.services)).toStrictEqual([
            'site',
            'www',
        ]);
        expect(config.secrets.services.www.keys).toStrictEqual(['TOKEN']);
        expect(config.secrets.services.www.opItem).toBe('dddd');
        expect(isPrettierClean(readCjs())).toBe(true);
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

        expect(Object.keys(config.secrets.services)).toStrictEqual([
            'api',
            'prismic-published-workflow',
        ]);
        expect(config.secrets.services.api.keys).toStrictEqual(['TOKEN']);
        expect(config.secrets.services.api.opItem).toBe('cccc');
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

        expect(config.secrets.services.api.keys).toStrictEqual(['TOKEN']);
        expect(config.secrets.services.api.opItem).toBe('cccc');
        expect(isPrettierClean(readCjs())).toBe(true);
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

        expect(contract.services.api.keys).toStrictEqual(['TOKEN']);
        expect(contract.services.api.opItem).toBe('cccc');
    }
);
