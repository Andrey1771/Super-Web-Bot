# Capture mode (DevTools)

Capture mode is **opt-in** and does not affect normal runtime UX.

## Enable before full-page screenshot

```js
await window.__TALE_ENABLE_CAPTURE_MODE__({ scrollToTop: true, settleFrames: 2 });
window.__TALE_VERIFY_CAPTURE_MODE__();
```

Expected verify output:
- `enabled: true`
- `attributeTarget: "html"`
- `headerPosition: "static"`

## Disable after capture

```js
window.__TALE_DISABLE_CAPTURE_MODE__();
window.__TALE_VERIFY_CAPTURE_MODE__();
```

Expected verify output:
- `enabled: false`
- `headerPosition: "fixed"` (on pages where header is mounted)
