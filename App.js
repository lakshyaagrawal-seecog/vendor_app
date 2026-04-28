import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

/**
 * Vendor flow: requesting `/vendor` redirects to `/vendor/login?callbackUrl=/vendor`.
 * Load vendor login explicitly so navigation targets the seller auth route.
 * Swap the host with https://yourdomain.com when you use your domain.
 */
const VENDOR_DASHBOARD_URI =
  'https://indovyapar.com/vendor/login?callbackUrl=%2Fvendor';

/**
 * Desktop Chrome UA — avoids some sites routing in-app browsers to consumer flows.
 * If OAuth (Google/Facebook) fails, remove `userAgent={WEBVIEW_USER_AGENT}` from WebView.
 */
const WEBVIEW_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function VendorScreen() {
  const webRef = useRef(null);
  const { width, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const viewportHeight = windowHeight - insets.top - insets.bottom;

  const [canGoBack, setCanGoBack] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [splash, setSplash] = useState(true);
  const [errorKey, setErrorKey] = useState(0);

  /** Last load error shown in overlay (network, WebView, or HTTP). */
  const [loadErrorMessage, setLoadErrorMessage] = useState(null);
  /** When false, navigator reports offline — block / warn. */
  const [isOffline, setIsOffline] = useState(false);

  const clearTransientError = useCallback(() => setLoadErrorMessage(null), []);

  /** Prevents clearing the error banner on load completion when HTTP 4xx/5xx is reported for the main doc. */
  const httpRejectedRef = useRef(false);
  /** True when the WebView reported a native load error for the current navigation. */
  const webViewFailedRef = useRef(false);

  const handleRetry = useCallback(() => {
    clearTransientError();
    setSplash(true);
    setErrorKey((k) => k + 1);
  }, [clearTransientError]);

  useEffect(() => {
    NetInfo.fetch().then((state) => {
      const offline =
        state.isConnected === false ||
        state.isInternetReachable === false;
      setIsOffline(Boolean(offline));
      if (offline) {
        setLoadErrorMessage('No internet connection.');
        setSplash(false);
      } else {
        setLoadErrorMessage((prev) =>
          prev === 'No internet connection.' ? null : prev,
        );
      }
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline =
        state.isConnected === false ||
        state.isInternetReachable === false;
      setIsOffline(Boolean(offline));
      if (offline) {
        setLoadErrorMessage('No internet connection.');
      } else {
        setLoadErrorMessage((prev) =>
          prev === 'No internet connection.' ? null : prev,
        );
      }
    });

    return () => unsubscribe();
  }, []);

  const onPullToRefresh = useCallback(() => {
    if (isOffline) {
      NetInfo.fetch().then((state) => {
        const offline =
          state.isConnected === false ||
          state.isInternetReachable === false;
        if (offline) {
          setLoadErrorMessage('No internet connection.');
        } else {
          setIsOffline(false);
          setRefreshing(true);
          webRef.current?.reload();
        }
      });
      return;
    }
    setRefreshing(true);
    webRef.current?.reload();
  }, [isOffline]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const onNavigationStateChange = useCallback((navState) => {
    setCanGoBack(navState.canGoBack ?? false);
  }, []);

  const onLoadStart = useCallback(() => {
    httpRejectedRef.current = false;
    webViewFailedRef.current = false;
  }, []);

  const onLoadEnd = useCallback(() => {
    setSplash(false);
    setRefreshing(false);
    if (
      !httpRejectedRef.current &&
      !webViewFailedRef.current &&
      !isOffline
    ) {
      setLoadErrorMessage(null);
    }
    httpRejectedRef.current = false;
    webViewFailedRef.current = false;
  }, [isOffline]);

  const onError = useCallback((syn) => {
    webViewFailedRef.current = true;
    const desc = syn?.nativeEvent?.description ?? 'Could not load the page.';
    setSplash(false);
    setRefreshing(false);
    setLoadErrorMessage(desc);
  }, []);

  const onHttpError = useCallback((syn) => {
    const code = syn?.nativeEvent?.statusCode;
    if (code != null && code >= 400) {
      httpRejectedRef.current = true;
      setSplash(false);
      setRefreshing(false);
      setLoadErrorMessage(`Unable to load (HTTP ${code}).`);
    }
  }, []);

  const webStyles =
    Platform.OS === 'android'
      ? [{ width }, { height: Math.max(viewportHeight, 1) }]
      : [styles.flexWeb];

  const webViewEl = (
    <WebView
      key={`vendor-${errorKey}`}
      ref={webRef}
      source={{ uri: VENDOR_DASHBOARD_URI }}
      style={webStyles}
      javaScriptEnabled
      domStorageEnabled
      cacheEnabled
      sharedCookiesEnabled
      allowsBackForwardNavigationGestures
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      thirdPartyCookiesEnabled
      mixedContentMode="compatibility"
      nestedScrollEnabled
      userAgent={WEBVIEW_USER_AGENT}
      originWhitelist={['*']}
      onNavigationStateChange={onNavigationStateChange}
      onLoadStart={onLoadStart}
      onLoadEnd={onLoadEnd}
      onError={onError}
      onHttpError={onHttpError}
      {...Platform.select({
        ios: {
          pullToRefreshEnabled: true,
          automaticallyAdjustContentInsets: true,
        },
        android: {
          domStorageEnabled: true,
          javaScriptEnabled: true,
        },
      })}
    />
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
      {Platform.OS === 'android' ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onPullToRefresh}
              tintColor="#1a73e8"
              colors={['#1a73e8']}
              enabled={!splash}
            />
          }
        >
          {webViewEl}
        </ScrollView>
      ) : (
        webViewEl
      )}

      {splash && !loadErrorMessage ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#1a73e8" />
        </View>
      ) : null}

      {loadErrorMessage ? (
        <View style={styles.errorWrap} accessibilityRole="alert">
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorDetail}>{loadErrorMessage}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <VendorScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  flex: {
    flex: 1,
  },
  flexWeb: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  errorWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#111',
  },
  errorDetail: {
    fontSize: 15,
    color: '#444',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: '#1a73e8',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
