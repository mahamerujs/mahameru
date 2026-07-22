# MahameruJS Minimal HTTP Server Typescript Example

This example use only for development purpose.

For production, you can use the [create-mahameru](https://github.com/bintan/create-mahameru) command to scaffold a new project, or run:

```bash
npm create mahameru@latest
```

Then choose the **Minimal HTTP Server Typescript** template.

## Development

In this monorepo architecture, we use [pnpm](https://pnpm.io/) as the package manager. If you don't have it installed, you can install it with:

```bash
npm install -g pnpm@latest
```

or:

```bash
// macOS / Linux
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

```bash
// Windows
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

Then run commands below on the root directory of the monorepo project:

```bash
pnpm install
```

After installing dependencies, run:

```bash
pnpm build
```

to build the project.

Then run:

```bash
cd test
pnpm dev
```

to run the test development server.

If you have any questions, please open an issue on [github](https://github.com/bintan/mahameru/issues).
Or catch me on [discord](https://discord.gg/7PNmMxykSF) or [instagram](https://instagram.com/bintvn).

Have a nice day!
