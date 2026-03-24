**Status:** pending

# 03 — Remove Bower and Migrate from Polymer 2 to Modern Web Components

## Overview

NyaoVim uses **Bower** as a secondary package manager to install **Polymer 2** and `webcomponentsjs`. Both are deprecated:

- **Bower** was officially deprecated in 2017. Its CDN (bower.io) is offline. No new packages are published to Bower.
- **Polymer 2** was superseded by Polymer 3 (npm-based) and then by **Lit** (the successor library from the Polymer team). Polymer 3 is itself in maintenance mode.

The renderer component `renderer/nyaovim-app.ts` is a Polymer 2 custom element. This task migrates it to **Lit 3** (or plain custom elements) and removes Bower entirely.

## Motivation

- Bower is a dead tool — `bower install` will eventually stop working entirely.
- Polymer 2 uses HTML imports, a spec that was removed from all browsers and requires a polyfill.
- Lit is the direct, Google-supported successor to Polymer with a much smaller footprint (~5 KB gzipped).
- Removing Bower simplifies the install process: `npm install` instead of `npm install && bower install`.
- Modern web components have native browser support (no polyfill needed in Chromium-based Electron).

## Current Polymer 2 Usage in `renderer/nyaovim-app.ts`

```typescript
// Current pattern: Polymer 2 class-based element
class NyaovimApp extends Polymer.Element {
    static get is() { return 'nyaovim-app'; }
    static get properties() {
        return {
            width: { type: Number, value: 800, notify: true },
            height: { type: Number, value: 600, notify: true },
            // ...
        };
    }
    // lifecycle: connectedCallback, ready()
}
customElements.define(NyaovimApp.is, NyaovimApp);
```

## Steps

### Step 1 — Remove Bower

1. Delete `bower.json`:
   ```bash
   rm bower.json
   ```

2. Remove `bower_components/` from the project (add to `.gitignore` if not already there):
   ```bash
   rm -rf bower_components
   ```

3. Update `.gitignore` to include `bower_components/`.

4. Remove bower from devDependencies:
   ```bash
   npm uninstall bower
   ```

5. Remove the `bower install` step from all npm scripts:
   ```json
   // package.json — change:
   "dep": "npm install && bower install"
   // to:
   "dep": "npm install"
   ```
   Or remove the `dep` script entirely and rely on the standard `npm install`.

6. Update `scripts/travis-before-install.sh` to remove any bower install steps.

### Step 2 — Install Lit

```bash
npm install lit
```

Since the project already uses TypeScript and compiles to CommonJS/ES2015, Lit integrates naturally.

### Step 3 — Remove `webcomponentsjs` polyfill

Since NyaoVim runs inside Electron's Chromium (which has full native Custom Elements v1 support), the `webcomponentsjs` polyfill is not needed.

Remove the polyfill `<script>` tag from `renderer/main.html`:

```html
<!-- REMOVE this line: -->
<script src="../bower_components/webcomponentsjs/webcomponents-loader.js"></script>
```

### Step 4 — Rewrite `renderer/nyaovim-app.ts` as a Lit element

```typescript
import { LitElement, html, css, property } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('nyaovim-app')
export class NyaovimApp extends LitElement {
    @property({ type: Number }) width = 800;
    @property({ type: Number }) height = 600;
    @property({ type: String }) fontSize = '';
    @property({ type: String }) nvimCmd = '';
    @property({ type: String }) extraArgs = '';
    @property({ type: Boolean }) disableAltKey = false;
    @property({ type: Boolean }) disableMetaKey = false;

    static styles = css`
        :host {
            display: block;
        }
    `;

    render() {
        return html`
            <neovim-editor
                id="nyaovim-editor"
                width="${this.width}"
                height="${this.height}"
                font-size="${this.fontSize}"
                nvim-cmd="${this.nvimCmd}"
                extra-args="${this.extraArgs}"
                ?disable-alt-key="${this.disableAltKey}"
                ?disable-meta-key="${this.disableMetaKey}"
            ></neovim-editor>
        `;
    }

    connectedCallback() {
        super.connectedCallback();
        // Move logic from current connectedCallback here
    }
}
```

Note: The `neovim-editor` component comes from `neovim-component` (see task 10 for that package's status).

### Step 5 — Update `renderer/lib.d.ts`

The current `lib.d.ts` declares global Polymer types. Replace with Lit types (or remove if not needed since Lit ships its own types).

### Step 6 — Update `renderer/main.html`

Replace the Polymer HTML import with a direct script import:

```html
<!-- REMOVE: -->
<link rel="import" href="../bower_components/polymer/polymer-element.html">

<!-- ADD: -->
<!-- Lit is loaded via the compiled JS, no separate script tag needed -->
```

Ensure the renderer HTML file loads the compiled `nyaovim-app.js` as a module if using ES modules, or via the existing `<script>` tag for CommonJS.

### Step 7 — Update tsconfig for decorators

Lit uses TypeScript decorators. Update `renderer/tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
}
```

### Step 8 — Update CI scripts

In `.travis.yml` (or the GitHub Actions workflow from task 10), remove any `bower install` step.

### Step 9 — Test

```bash
npm install
npm run build
npm run app
npm run smoke-test
```

Verify the `<nyaovim-app>` element renders and connects to Neovim correctly.

## Alternative: Plain Custom Elements (no framework)

If the Lit migration seems heavy, consider rewriting `nyaovim-app.ts` as a vanilla Custom Element (`HTMLElement` subclass with `connectedCallback`). The component is not complex enough to strictly require a library — Polymer/Lit were primarily chosen for property binding, which is minimal in this case.

## References

- [Lit documentation](https://lit.dev)
- [Lit migration guide from Polymer](https://lit.dev/docs/releases/upgrade/)
- [Bower deprecation announcement](https://bower.io/blog/2017/how-to-migrate-away-from-bower/)
- [Web Components native support](https://caniuse.com/custom-elementsv1)
