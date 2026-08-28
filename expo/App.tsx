// ColorFall native shell: the game is a self-contained HTML canvas app
// (generated into game-html.ts by `npm run build:expo` at the repo root),
// rendered in a WebView. The game posts {t:"haptic",k} messages through
// window.ReactNativeWebView; we map them to expo-haptics here.

import React from "react";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { GAME_HTML } from "./game-html";

function onMessage(event: WebViewMessageEvent): void {
  try {
    const msg = JSON.parse(event.nativeEvent.data) as { t?: string; k?: string };
    if (msg.t !== "haptic") return;
    if (msg.k === "light") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (msg.k === "click") void Haptics.selectionAsync();
    else if (msg.k === "win")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // malformed message: ignore
  }
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#101214" }} edges={["top", "bottom"]}>
        <StatusBar style="light" backgroundColor="#101214" />
        <WebView
          source={{ html: GAME_HTML, baseUrl: "https://colorfall.local/" }}
          originWhitelist={["*"]}
          style={{ flex: 1, backgroundColor: "#101214" }}
          javaScriptEnabled
          domStorageEnabled
          bounces={false}
          overScrollMode="never"
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          onMessage={onMessage}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
