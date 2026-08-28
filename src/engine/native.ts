// Bridge to a native wrapper (Expo WebView). On the plain web this is a
// no-op; inside the wrapper, messages reach React Native for haptics etc.

type HapticKind = "light" | "click" | "win";

interface RNWebView {
  postMessage(msg: string): void;
}

function bridge(): RNWebView | null {
  const w = window as unknown as { ReactNativeWebView?: RNWebView };
  return w.ReactNativeWebView ?? null;
}

export const native = {
  haptic(kind: HapticKind): void {
    try {
      bridge()?.postMessage(JSON.stringify({ t: "haptic", k: kind }));
    } catch {
      // never let the bridge take the game down
    }
  },
};
