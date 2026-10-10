'use strict';

// Tests for generateSecretManifests: deployed-environment shapes render
// contract-derived SecretProviderClasses and SecretSyncs into the
// compiled folder, and shared-shaped locations are rejected with
// guidance (shared secrets are consumed through a service's sharedKeys).

import { expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    generateSecretManifests,
} = require('../bin/lib/c-secrets-manifests.js');

const config = () => ({
    project: {
        gcpProjectId: 'demo-proj',
        name: 'demo',
        organisation: 'idearium',
    },
    gcloud: {
        region: 'australia-southeast1',
    },
    secrets: {
        services: {
            site: {
                opItem: 'siteitem',
                keys: ['CACHE_URL'],
                sharedKeys: ['IMGIX_TOKEN'],
            },
        },
        shared: {
            opItem: 'services.site',
            keys: ['IMGIX_TOKEN'],
        },
    },
});

// Run an async body inside a temp directory (the compiled folder is
// created relative to the current working directory); the directory
// lives until the body settles.
const inTempDir = async (body) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c-secrets-manifests-'));
    const previousCwd = process.cwd();

    process.chdir(dir);

    try {
        return await body(path.join(dir, '.compiled'));
    } finally {
        process.chdir(previousCwd);
        fs.rmSync(dir, { force: true, recursive: true });
    }
};

it('generates SecretProviderClass and SecretSync manifests for a service', () =>
    inTempDir(async (compiled) => {
        const generated = await generateSecretManifests({
            config: config(),
            env: 'beta',
            namespace: 'idearium-demo-beta',
            path: '',
            services: [
                {
                    path: 'site.secretproviderclass',
                    type: 'secretproviderclass',
                },
                { path: 'site.secretsync', type: 'secretsync' },
            ],
        });

        expect(generated.sort()).toStrictEqual([
            'site.secretproviderclass.yaml',
            'site.secretsync.yaml',
        ]);

        const spc = fs.readFileSync(
            path.join(compiled, 'site.secretproviderclass.yaml'),
            'utf8'
        );
        const sync = fs.readFileSync(
            path.join(compiled, 'site.secretsync.yaml'),
            'utf8'
        );

        // Owned and borrowed keys both appear, in sorted order.
        expect(spc).toContain(
            "- resourceName: 'projects/demo-proj/secrets/idearium-demo-beta-site-cache-url/versions/latest'"
        );
        expect(spc).toContain("path: 'cache-url'");
        expect(spc).toContain(
            "- resourceName: 'projects/demo-proj/secrets/idearium-demo-beta-imgix-token/versions/latest'"
        );
        expect(sync).toContain("targetKey: 'IMGIX_TOKEN'");
        expect(sync).toContain('secretProviderClassName: site');
    }));

it('rejects shared-shaped locations with guidance', () =>
    inTempDir(async () => {
        await expect(
            generateSecretManifests({
                config: config(),
                env: 'beta',
                namespace: 'idearium-demo-beta',
                path: '',
                services: [
                    {
                        path: 'shared.secretproviderclass',
                        type: 'secretproviderclass',
                    },
                ],
            })
        ).rejects.toThrow(/sharedKeys/);
    }));
