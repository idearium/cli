# @idearium/cli

If you'd like to contribute to the cli, you've come to the right spot :)

## Requirements

To get started with development, you'll need:

- Node.js >v8.0.0
- NPM >v4.3.0

## Code

We use `eslint` and `.editorconfig` to keep our code neat and tidy. Make sure you do too.

If you're developing locally and want to test out the cli against an actual project, run `npm link` from this directory. When you're done, make sure you run `npm unlink` to ensure you remove the global install.

## Publishing

When you're ready to publish a new version, there are a few scripts to help you:

- `npm run prerelease-release` to version bump, prerelease, and push to NPM.
- `npm run patch-release` to version bump, patch, and push to NPM.
- `npm run minor-release` to version bump, minor, and push to NPM.
- `npm run major-release` to version bump, major, and push to NPM.

These will also create a git tag, and push to the remote repository.
