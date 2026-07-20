# @mahameru/magma

> The official core HTTP server engine for Mahameru JS. Magma provides a lightweight, blazing-fast, and robust routing system built exclusively for the Mahameru ecosystem.

⚠️ **WARNING: UNDER ACTIVE DEVELOPMENT**  
This plugin is currently in its early development phase (**v0.x.x**). **Breaking changes and frequent public API updates will occur** as we stabilize the core logic. Use in production at your own risk.

---

## ⚡ Features (Under Development)

* **Mahameru Native:** Designed from the ground up to integrate seamlessly with Mahameru JS core.
* **Folder-Based Routing:** Intuitively map your file and directory structures directly into HTTP endpoints.
* **Lightweight & Modular:** Zero unnecessary dependencies, keeping your Mahameru apps lean.
* **Extensible Middleware:** Simple pipeline setup to intercept requests and responses at any folder level.

## 🚀 Quick Start (Experimental)

> **Note:** Since the API is highly unstable, syntax may change across minor releases.

### Installation

```bash
npm install @mahameru/magma
# or
yarn add @mahameru/magma
# or
pnpm add @mahameru/magma
```

### Usage

```bash
import { MahameruResponse } from '@mahameru/magma';

const app = new Mahameru();

// Register the magma plugin
app.use(magma({
  port: 3000
}));

app.get('/', (req, res) => {
  res.send('Hello from Magma! 🌋');
});

app.start();
```

## 🗺️ Roadmap & Stability Goals
[ ] Stabilize core HTTP routing and request context.

[ ] Implement robust error handling and built-in logger integration.

[ ] Add comprehensive middleware support.

[ ] Reconcile and lock the public API for the v1.0.0 stable release.

## 🤝 Contributing
Since this plugin is in early alpha, we are not accepting major feature requests just yet. However, bug reports and early feedback on the API design are highly welcome! Please open an issue if you encounter any unexpected behavior.

## 📄 License
MIT © Mahameru Ecosystem