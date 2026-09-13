// Wall Sprint — offline driver.
// Replaces the portal SDK bridge (YG 1.x template) with a neutral local one.
// Exposes every template global the framework glue calls, a minimal fake
// `ysdk`, localStorage-backed saves, and a no-op analytics relay so the game
// never touches the network.
(function () {
  'use strict';

  // The engine logs two known informational notices through console.error
  // (IDBFS sync concurrency + manual persistentDataPath sync deprecation).
  // Filter only these exact texts so real errors stay visible.
  var origConsoleError = console.error.bind(console);
  console.error = function () {
    var msg = Array.prototype.join.call(arguments, ' ');
    if (/FS\.syncfs operations in flight|Manual synchronization of Unity Application\.persistentDataPath/i.test(msg)) return;
    return origConsoleError.apply(null, arguments);
  };

  var gameInstance = null;
  var initGame = false;
  var nowFullAdOpen = false;

  function game() {
    return window.myGameInstance || window.ygGameInstance || null;
  }

  function send(method, arg) {
    var g = game();
    if (!g) return;
    try {
      if (arg === undefined) g.SendMessage('LegacyGame', method);
      else g.SendMessage('LegacyGame', method, arg);
    } catch (e) { /* game not ready to receive yet */ }
  }

  function sendWhenReady(method, arg) {
    setTimeout(function () { send(method, arg); }, 120);
  }

  function focusGame() {
    try { window.focus(); } catch (e) { }
    var c = document.getElementById('unity-canvas');
    if (c) { try { c.focus({ preventScroll: true }); } catch (e) { } }
  }

  window.focusGame = focusGame;
  window.ResumeGame = function () {
    var g = game();
    try { if (g && g.Module && g.Module.resumeMainLoop) g.Module.resumeMainLoop(); } catch (e) { }
    var media = document.querySelectorAll('audio, video');
    for (var i = 0; i < media.length; i++) { try { media[i].muted = false; } catch (e) { } }
  };

  // ---- analytics relay: neutral no-ops ------------------------------------
  window.ym = function () { };
  window.legacyMetricaCounterId = 0;

  // ---- storage bridge (cloud => localStorage) ------------------------------
  var NO_DATA = 'noData';

  function lsGet(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ }
  }

  window.cloudSaves = NO_DATA;
  window.paymentsData = 'none';
  window.player = null;
  window.payments = null;
  window.leaderboard = null;
  window.initGame = false;
  window.nowFullAdOpen = false;
  window.LocalHost = function () { return true; };

  function envirJson() {
    var isMobile = ('ontouchstart' in window) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    var browser = 'Other';
    var ua = navigator.userAgent;
    if (ua.indexOf('YaBrowser') >= 0 || ua.indexOf('YaSearchBrowser') >= 0) browser = 'Chrome';
    else if (ua.indexOf('Opera') >= 0 || ua.indexOf('OPR') >= 0) browser = 'Opera';
    else if (ua.indexOf('Firefox') >= 0) browser = 'Firefox';
    else if (ua.indexOf('MSIE') >= 0) browser = 'IE';
    else if (ua.indexOf('Edge') >= 0) browser = 'Edge';
    else if (ua.indexOf('Chrome') >= 0) browser = 'Chrome';
    else if (ua.indexOf('Safari') >= 0) browser = 'Safari';
    return JSON.stringify({
      language: (navigator.language || 'en').slice(0, 2),
      domain: 'offline',
      deviceType: isMobile ? 'mobile' : 'desktop',
      isMobile: isMobile,
      isDesktop: !isMobile,
      isTablet: false,
      isTV: false,
      appID: 'offline',
      browserLang: navigator.language || 'en',
      payload: '',
      promptCanShow: false,
      reviewCanShow: false,
      platform: navigator.platform || 'web',
      browser: browser
    });
  }

  function playerJson() {
    return JSON.stringify({
      playerAuth: 'rejected',
      playerName: 'unauthorized',
      playerId: 'unauthorized',
      playerPhoto: 'unknown',
      payingStatus: 'unknown'
    });
  }

  window.environmentData = envirJson();
  window.playerData = playerJson();

  window.RequestingEnvironmentData = function (sendback) {
    window.environmentData = envirJson();
    if (sendback) sendWhenReady('SetEnvirData', window.environmentData);
    return Promise.resolve(window.environmentData);
  };

  window.InitPlayer = function (sendback) {
    window.playerData = playerJson();
    if (sendback) sendWhenReady('SetInitializationSDK', window.playerData);
    return Promise.resolve(window.playerData);
  };

  window.NotAuthorized = function () { return playerJson(); };

  window.OpenAuthDialog = function () { /* offline: no accounts */ };

  window.SaveCloud = function (jsonData, flush) {
    lsSet('saves', String(jsonData));
  };

  window.LoadCloud = function (sendback) {
    var stored = lsGet('saves');
    var payload = stored === null ? NO_DATA : JSON.stringify([stored]);
    window.cloudSaves = payload;
    if (sendback) sendWhenReady('SetLoadSaves', payload);
    return Promise.resolve(payload);
  };

  window.InitCloudStorage = function () { return window.cloudSaves; };
  window.InitEnvironmentData = function () { return window.environmentData; };
  window.InitPlayerData = function () { return window.playerData; };
  window.InitPaymentsData = function () { return window.paymentsData; };

  // ---- payments: always unavailable, gracefully ----------------------------
  window.GetPayments = function (sendback) {
    window.paymentsData = 'none';
    return Promise.resolve('none');
  };
  window.BuyPayments = function (id) {
    setTimeout(function () { send('OnPurchaseFailed', String(id)); }, 60);
    focusGame();
  };
  window.ConsumePurchase = function () { };
  window.ConsumePurchases = function () { };

  // ---- leaderboards: local, empty ------------------------------------------
  window.InitLeaderboards = function () { };
  window.WaitForLeaderboard = function () { return Promise.resolve(); };
  window.SetLeaderboardScores = function (nameLB, score) { };

  window.GetLeaderboardScores = function (nameLB, maxPlayers, quantityTop, quantityAround, photoSize, auth) {
    sendWhenReady('LeaderboardEntries', JSON.stringify({
      technoName: String(nameLB || ''),
      isDefault: false,
      isInvertSortOrder: false,
      decimalOffset: 0,
      type: '',
      entries: 'no data',
      ranks: [], photos: [], names: [], scores: [], uniqueIDs: []
    }));
  };

  // ---- ads: neutral, never blocks the game ----------------------------------
  window.FullAdShow = function () {
    if (nowFullAdOpen) return;
    nowFullAdOpen = true;
    window.nowFullAdOpen = true;
    if (initGame) send('OpenFullAd');
    setTimeout(function () {
      nowFullAdOpen = false;
      window.nowFullAdOpen = false;
      if (initGame) {
        send('CloseFullAd', 'false');
        send('CloseFullAd', 'true');
      }
      focusGame();
    }, 60);
  };

  window.RewardedShow = function (id) {
    // Neutral rewarded flow: open, grant, close — no video, no network.
    send('OpenVideo');
    setTimeout(function () {
      send('RewardVideo', String(id === undefined ? '' : id));
      send('CloseVideo');
      focusGame();
    }, 120);
  };

  window.StickyAdActivity = function (show) { /* no banner ads offline */ };

  window.Review = function () {
    focusGame(); // reviews unavailable offline; C# handles via reviewCanShow flag
  };

  window.PromptShow = function () {
    setTimeout(function () { send('OnPromptFail'); }, 60);
    focusGame();
  };

  window.InitGame = function () {
    if (initGame) return;
    initGame = true;
    window.initGame = true;
  };

  window.InitLeaderboards = window.InitLeaderboards;

  // ---- fake ysdk surface used by the framework glue -------------------------
  // Built synchronously: the glue reads the global directly and must never
  // see null or a pending promise.
  var isMobile = ('ontouchstart' in window) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  var fakeSdk = {
    on: function () { },
    serverTime: function () { return new Date().toISOString().slice(0, 19); },
    environment: {
      i18n: { lang: 'en', tld: 'offline' },
      app: { id: 'offline' },
      browser: { lang: navigator.language || 'en' },
      payload: ''
    },
    deviceInfo: {
      type: isMobile ? 'mobile' : 'desktop',
      isMobile: function () { return isMobile; },
      isDesktop: function () { return !isMobile; },
      isTablet: function () { return false; },
      isTV: function () { return false; }
    },
    features: {
      LoadingAPI: { ready: function () { } },
      GameplayAPI: { start: function () { }, stop: function () { } }
    },
    screen: {
      fullscreen: {
        status: 'off',
        request: function () {
          var el = document.documentElement;
          if (el.requestFullscreen) { try { el.requestFullscreen(); } catch (e) { } }
        },
        exit: function () { if (document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) { } } }
      }
    },
    player: {
      getData: function () { return Promise.resolve({ saves: null }); },
      setData: function () { return Promise.resolve(); },
      getStats: function () { return Promise.resolve({}); },
      setStats: function () { return Promise.resolve(); }
    },
    adv: {
      showFullscreenAdv: function (opts) {
        var cb = (opts && opts.callbacks) || {};
        if (cb.onOpen) { try { cb.onOpen(); } catch (e) { } }
        setTimeout(function () { if (cb.onClose) { try { cb.onClose(false); } catch (e) { } } }, 50);
      },
      showRewardedVideo: function (opts) {
        var cb = (opts && opts.callbacks) || {};
        if (cb.onOpen) { try { cb.onOpen(); } catch (e) { } }
        setTimeout(function () {
          if (cb.onRewarded) { try { cb.onRewarded(); } catch (e) { } }
          if (cb.onClose) { try { cb.onClose(); } catch (e) { } }
        }, 80);
      },
      getBannerAdvStatus: function () { return Promise.resolve({ stickyAdvIsShowing: false, reason: 'offline' }); },
      showBannerAdv: function () { return Promise.resolve(); },
      hideBannerAdv: function () { return Promise.resolve(); }
    },
    getPayments: function () { return Promise.reject(new Error('payments unavailable offline')); },
    getLeaderboards: function () { return Promise.reject(new Error('leaderboards unavailable offline')); },
    feedback: { canReview: function () { return Promise.resolve({ value: false, reason: 'offline' }); } },
    shortcut: { canShowPrompt: function () { return Promise.resolve({ canShow: false }); }, showPrompt: function () { return Promise.resolve({ outcome: 'rejected' }); } },
    auth: { openAuthDialog: function () { return Promise.resolve(); } }
  };
  window.ysdk = fakeSdk;
  window.YaGames = { init: function () { return Promise.resolve(fakeSdk); } };
})();