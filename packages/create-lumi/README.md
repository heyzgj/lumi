# create-lumi

Create a new Lumi project with one command.

## Usage

```bash
npx create-lumi my-project
cd my-project
```

Or setup in current directory:

```bash
npx create-lumi
```

## Options

```
--no-install    Skip dependency installation
--no-build      Skip extension build
--no-server     Don't start the dev server after setup
--help          Show help message
--version       Show version
```

## What it does

1. Clones the Lumi repository
2. Installs all dependencies
3. Creates default configuration
4. Builds the Chrome extension
5. Starts the development server

## Next steps after setup

Load the extension in Chrome:
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `extension` folder

## Links

- [Documentation](https://github.com/heyzgj/lumi)
- [Issues](https://github.com/heyzgj/lumi/issues)
