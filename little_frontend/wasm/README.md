# WASM Extension Point

Currently all heavy processing is done via Python backend or TypeScript.

## When to add WASM here:
- File parsing (PDF text extraction, Markdown outline) becomes slow in TS
- Cryptographic operations (hashing large files) need speed
- Canvas file download needs client-side processing before saving

## How to add (后期步骤):
1. Create `little_wasm/` at repo root: `cargo new --lib little_wasm`
2. Build with `wasm-pack build --target web`
3. Install in frontend: `npm install ../../little_wasm/pkg`
4. Update `vite.config.ts` add `wasm()` plugin
5. Import in `src/wasm/index.ts` and export typed functions

## Interface Design:
All WASM functions should be wrapped in `src/wasm/wrapper.ts` 
to provide fallback to TS implementations if WASM fails to load.
