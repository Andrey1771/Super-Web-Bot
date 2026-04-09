# Screenshot capture from DevTools (one command)

No manual `enableCaptureMode()` step is required.

## One-command full-page capture

```js
const result = await window.__TALE_CAPTURE_PAGE__();
```

Alternative namespace:

```js
const result = await window.__TALE_SCREENSHOT__.capturePage();
```

## What helper does automatically

1. Enables capture mode (`data-capture-mode="true"`).
2. Waits at least 2 animation frames.
3. Scrolls to top.
4. Runs stitched full-page capture pass through the page.
5. Downloads screenshot file automatically.
6. Always disables capture mode in `finally` and restores original scroll position.

## Return value

`result` includes:
- `blob` — screenshot payload
- `dataUrl` — base64 data URL
- `width`, `height` — final canvas size
- `segments` — number of stitched viewport segments
- `modeVerification` — capture-mode diagnostic snapshot
- `fileName` — downloaded file name

## Optional call options

```js
await window.__TALE_CAPTURE_PAGE__({
  fileName: 'blog-full-page.png',
  format: 'image/png',
  scale: 1,
  settleFrames: 2,
  autoDownload: true
});
```
