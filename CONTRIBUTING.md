# @idearium/cli

If you'd like to contribute to the cli, you've come to the right spot :)

## Requirements

To get started with development, you'll need:

-   Node.js >v8.0.0
-   NPM >v4.3.0

## Code

We use `eslint` and `.editorconfig` to keep our code neat and tidy. Make sure you do too.

If you're developing locally and want to test out the cli against an actual project, run `yarn link` from this directory. When you're done, make sure you run `yarn unlink` to ensure you remove the global install.

## Publishing

When you're ready to publish a new version:

-   Version bump the package.json version.
-   Update the changelog.
-   Create a new release via the Github UI with the tag `vX.X.X`, branch name as the current branch and the release name the same as the tag `vX.X.X`.
