<div align="center">
  <img src="public/logo.png" alt="Paperditor" width="320" />

  <p><strong>A clean, distraction-free Markdown editor.</strong></p>
  <p>Write beautifully. Stay focused. Own your files.</p>

  <p>
    <img src="https://img.shields.io/badge/Windows-supported-blue?logo=windows" alt="Windows: supported" />
    <img src="https://img.shields.io/badge/macOS-experimental-lightgrey?logo=apple" alt="macOS: experimental" />
    <img src="https://img.shields.io/badge/Linux-experimental-lightgrey?logo=linux" alt="Linux: experimental" />
    <img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT" />
    <img src="https://img.shields.io/badge/version-1.0.0-orange" alt="Version: 1.0.0" />
    <img src="https://img.shields.io/badge/built%20with-Electron%20%2B%20React-61DAFB?logo=react" alt="Built with Electron + React" />
  </p>

  <br/>

  <a href="https://github.com/guisaldanha/paperditor/releases/latest">
    <img src="public/download.png" alt="Download for Windows" height="60" />
  </a>

  <br/><br/>
</div>

---

## ✨ What is Paperditor?

**Paperditor** is a free, open-source desktop Markdown editor that renders your text as you type — no preview pane needed. It feels as natural as a word processor while keeping your content in clean, portable `.md` files that you own forever.

Built for developers, writers, and anyone who loves Markdown.

---

## 🖥️ Screenshots

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>🌙 Dark Theme</strong></td>
      <td align="center"><strong>☀️ Light Theme</strong></td>
    </tr>
    <tr>
      <td><img src="public/print-dark-theme.png" alt="Dark Theme" width="480" /></td>
      <td><img src="public/print-light-theme.png" alt="Light Theme" width="480" /></td>
    </tr>
  </table>
</div>

---

## 🚀 Features

### ✍️ Editing Experience
- **WYSIWYG Markdown editing** — content renders live as you type, no split panes
- **Dual mode** — switch between rich WYSIWYG and raw Markdown source at any time
- **Unsaved-changes indicator** — bullet (`•`) in the title bar when you have unsaved work
- **File associations** — double-click any `.md` or `.markdown` file to open it directly in Paperditor
- **Single-instance aware** — opening a second file focuses the existing window instead of spawning a new one

### 📝 Formatting Toolbar
| Category | Supported |
|---|---|
| Headings | H1 · H2 · H3 · H4 · H5 · H6 |
| Inline | **Bold** · *Italic* · ~~Strikethrough~~ · ==Highlight== · `Code` |
| Script | Superscript · Subscript |
| Lists | Bullet · Ordered · Task (checkbox) lists |
| Blocks | Blockquote · Code block (syntax-highlighted) · Horizontal rule |
| Links & Media | Hyperlinks · Inline images |
| Tables | Insert table · Add/remove rows & columns · Toggle header row/column/cell |
| Alignment | Left · Center · Right · Justify |
| Extras | Footnotes · Emoji picker (categorized, searchable) |

### 📁 File Operations
- Open, Save, Save As `.md` files
- **Export to PDF** — clean, print-ready output
- **Print** — send directly to your printer

### 🎨 Themes
- **Light** and **Dark** themes — toggled with a single click, persisted across sessions

### 🔍 Find & Replace
- Inline find bar (`Ctrl+F`) — search through your document without leaving the editor

---

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| New file | `Ctrl+N` |
| Open file | `Ctrl+O` |
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Export PDF | `Ctrl+Shift+E` |
| Print | `Ctrl+P` |
| Find | `Ctrl+F` |
| Bold | `Ctrl+B` |
| Italic | `Ctrl+I` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` / `Ctrl+Shift+Z` |
| Toggle fullscreen | `F11` |

---

## 📦 Installation

### Download (recommended)

Download the latest Windows installer from the [Releases page](https://github.com/guisaldanha/paperditor/releases/latest) and run the `.exe` setup file.

<div align="center">
  <a href="https://github.com/guisaldanha/paperditor/releases/latest">
    <img src="public/download.png" alt="Download for Windows" height="60" />
  </a>
</div>

#### macOS / Linux (experimental)

Every release also publishes a `.dmg` (macOS) and `.AppImage` (Linux) build from the same source, generated automatically by CI. They aren't manually tested on those platforms yet, so expect rough edges — [bug reports](https://github.com/guisaldanha/paperditor/issues) are very welcome.

### Build from Source

> Requirements: **Node.js 18+** and **npm**

```bash
# Clone the repository
git clone https://github.com/guisaldanha/paperditor.git
cd paperditor

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build the installer
npm run build
```

The compiled installer will be placed in `release/<version>/`.

---

## ⚠️ Security Warnings (unsigned builds)

None of the installers are code-signed (no paid certificate), so your OS will warn you before running them. The source code is fully open — feel free to review it and build the executable yourself.

- **Windows**: SmartScreen may flag the `.exe` as unrecognized. Click **"More info" → "Run anyway"**.
- **macOS**: Gatekeeper will block the `.dmg` as "damaged" or "from an unidentified developer". Right-click the app → **Open**, or run `xattr -cr /Applications/Paperditor.app` to clear the quarantine flag.
- **Linux**: mark the `.AppImage` as executable before running it: `chmod +x Paperditor-Linux-*.AppImage`.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Shell | [Electron](https://www.electronjs.org/) |
| UI | [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Editor Engine | [TipTap](https://tiptap.dev/) |
| Markdown Parser | [@tiptap/markdown](https://tiptap.dev/docs/editor/extensions/functionality/markdown) |
| Code Highlighting | [lowlight](https://github.com/wooorm/lowlight) |
| Bundler | [Vite](https://vitejs.dev/) |
| Packaging | [electron-builder](https://www.electron.build/) |

---

## 👨‍💻 Author

Developed by **Guilherme Saldanha**

- GitHub: [https://github.com/guisaldanha](https://github.com/guisaldanha)
- Site: [https://guisaldanha.com](https://guisaldanha.com)

---

## ❤️ Support the Developer

If this project saves you time or helps your workflow, consider supporting its development.

Ways to help:

- ⭐ **Star the repository**
- 🔁 **Share with other developers**
- ☕ **[Buy me a coffee](https://www.paypal.com/paypalme/guisaldanha) by clicking here (PayPal)**

---

## 📜 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

<div align="center">
  Made with ☕ by <a href="https://guisaldanha.com">Guilherme Saldanha</a>
</div>
