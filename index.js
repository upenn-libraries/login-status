var LOGIN = {};

LOGIN.getTimestamp = function getTimestamp() {
  if (Date.now) {
    return Date.now();
  } else {
    return new Date().getTime();
  };
};

var modules = {};

LOGIN.getModule = function getModule(cacheKey) {

  var ret = modules[cacheKey];
  if (ret !== undefined) {
    return ret;
  }
  
  var logoutURL = undefined;
  var console = window.console || { log: function(arg) {} };
  var inMemoryCache = undefined;
  var intervalKey = undefined;
  var nextPing = undefined;
  var loggedInPingInterval = 60000; // milliseconds
  var loggedOutPingInterval = 60000; // milliseconds
  var timeoutInterval = 2000; // milliseconds
  var autoPoll = false;
  var url = undefined;
  var callbackPrefix = cacheKey;
  var callbackId = 0;
  var lastLoggedInStatus = null;
  var mintCallbackId = function mintCallbackId() {
    var ret = callbackId;
    callbackId = (callbackId + 1) % 1000;
    return ret;
  };
  var loggedIn = function loggedIn(data, ext) {
    if (data.cached) {
      pingInternal(ext); // always recheck status if logged in
    } else {
      cache(data, true, ext);
    }
    execute(onLoggedIn, data, lastLoggedInStatus);
    lastLoggedInStatus = true;
  };
  var notLoggedIn = function notLoggedIn(data, ext) {
    if (data) {
      if (data.cached) {
        if (getTimeToNextPing(data, true) <= 0) {
          pingInternal(ext);
        }
      } else {
        cache(data, false, ext);
      }
    } else {
      pingInternal(ext);
    }
    execute(onNotLoggedIn, data, lastLoggedInStatus);
    lastLoggedInStatus = false;
  };
  var getTimeToNextPing = function getTimeToNextPing(data, partial, interval) {
    var current = LOGIN.getTimestamp();
    if (!interval) {
      var period = data.loggedIn ? loggedInPingInterval : loggedOutPingInterval;
      interval = Math.max(0, partial ? period - (current - data.timestamp) : period);
    }
    nextPing = current + interval;
    return interval;
  };
  var cache = function cache(data, loggedIn, ext) {
    data.cached = true;
    data.loggedIn = loggedIn;
    data.timestamp = LOGIN.getTimestamp();
    inMemoryCache = data;
    if (window.sessionStorage) {
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
    } else {
      var dcs = cacheKey + "=" + encodeURIComponent(JSON.stringify(data)) + "; path=/";
      document.cookie = dcs;
    }
    timeoutPing(data, false, true);
  };
  var cached = function cached() {
    var data;
    if (inMemoryCache) {
      data = inMemoryCache;
    } else {
      if (window.sessionStorage) {
        data = inMemoryCache = JSON.parse(sessionStorage.getItem(cacheKey));
      } else {
        var dataS = getCookie(cacheKey);
        data = inMemoryCache = dataS ? JSON.parse(decodeURIComponent(dataS)) : undefined;
      }
    }
    return data;
  };
  var getCookie = function getCookie(name) {
    var cookies = document.cookie.split(/\s*;\s*/);
    var dataS = undefined;
    for (var i = 0; dataS == undefined && i < cookies.length; i++) {
      var c = cookies[i];
      var kvSplit = c.indexOf('=');
      if (name === c.slice(0, kvSplit)) {
        dataS = c.slice(kvSplit + 1);
      }
    }
    return dataS;
  }; 
  var reinitInterval = function reinitInterval() {
    var data = cached();
    if (data) {
      timeoutPing(data, true, true);
    }
  };
  var timeoutPing = function timeoutPing(data, partial, clear, intervalOverride) {
    if (clear && intervalKey) {
      clearTimeout(intervalKey);
    }
    if (autoPoll) {
      intervalKey = setTimeout(function() {
        pingInternal(false);
      }, getTimeToNextPing(data, partial, intervalOverride));
    }
  };
  var pingInternal = function pingInternal(ext) {
    var timeoutFunction = function timeoutFunction() {
      console.log("checked status, not logged in");
      notLoggedIn({}, ext);
      head.removeChild(script);
      try {
        delete(window[callbackName]);
      } catch (e) {
        window[callbackName] = undefined;
      }
    };
    var timeoutKey = setTimeout(timeoutFunction, timeoutInterval);
    var head = document.head ? document.head : document.getElementsByTagName('head')[0];
    var script = document.createElement("script");
    var callbackName = callbackPrefix;// + mintCallbackId();
    window[callbackName] = function(data) {
      console.log("checked status, logged in");
      clearTimeout(timeoutKey);
      loggedIn(data, ext);
      head.removeChild(script);
      try {
        delete(window[callbackName]);
      } catch (e) {
        window[callbackName] = undefined;
      }
    };
    script.setAttribute('src', url + '?callback=' + callbackName + '&timestamp=' + LOGIN.getTimestamp());
    head.appendChild(script);
  };
  var execute = function execute(functions, data, lastLoggedInStatus) {
    for (var i in functions) {
      functions.hasOwnProperty(i) && functions[i](data, lastLoggedInStatus);
    }
  };
  var onLoggedIn = {};
  var onNotLoggedIn = {};

  ret = {
    init: function init() {
      var data = cached();
      if (data) {
        if (data.loggedIn) {
          loggedIn(data, true);
          return true;
        } else {
          notLoggedIn(data, true);
          return false;
        }
      } else {
        notLoggedIn(undefined, true);
        return false;
      }
    },
    reinit: function reinit() {
      var data = cached();
      if (data && data.loggedIn) {
        execute(onLoggedIn, data);
      }
    },
    ping: function ping() {
      pingInternal(true);
    },
    getTimeToNextPing: function getTimeToNextPing() {
      return nextPing ? Math.round((nextPing - LOGIN.getTimestamp()) / 1000) : 0;
    },
    isLoggedIn: function isLoggedIn() {
      var data = cached();
      return data ? data.loggedIn : false;
    },
    clearCache: function clearCache(loggingOut) {
      console.log('clearing cache, '+loggingOut);
      inMemoryCache = undefined;
      nextPing = undefined;
      if (loggingOut) {
        execute(onNotLoggedIn);
      }
      timeoutPing(undefined, undefined, true, 1000);
      if (window.sessionStorage) {
        return sessionStorage.removeItem(cacheKey);
      } else {
        var oldValue = getCookie(cacheKey);
        var exp = new Date();
        exp.setTime(exp.getTime() - (24*60*60*1000));
        document.cookie = cacheKey+"=; expires="+exp.toGMTString()+"; path=/";
        return oldValue;
      }
    },
    setTimeoutMillis: function setTimeoutMillis(millis) {
      timeoutInterval = millis;
    },
    getTimeoutMillis: function getTimeoutMillis() {
      return timeoutMillis;
    },
    setLoggedOutPingIntervalSeconds: function setLoggedOutPingIntervalSeconds(seconds) {
      loggedOutPingInterval = seconds * 1000;
      reinitInterval();
    },
    getLoggedOutPingIntervalSeconds: function getLoggedOutPingIntervalSeconds() {
      return loggedOutPingInterval / 1000;
    },
    setLoggedInPingIntervalSeconds: function setLoggedInPingIntervalSeconds(seconds) {
      loggedInPingInterval = seconds * 1000;
      reinitInterval();
    },
    getLoggedInPingIntervalSeconds: function getLoggedInPingIntervalSeconds() {
      return loggedInPingInterval / 1000;
    },
    setURL: function setURL(sourceURL) {
      url = sourceURL
    },
    getURL: function getURL() {
      return url;
    },
    setCallbackPrefix: function setCallbackPrefix(prefix) {
      callbackPrefix = prefix;
    },
    getCallbackPrefix: function getCallbackPrefix() {
      return callbackPrefix;
    },
    setAutoPoll: function(val) {
      autoPoll = val;
      reinitInterval();
    },
    loginOnclick: function(evt) {
      if (!ret.isLoggedIn()) {
        ret.clearCache();
      }
      return true;
    },
    logoutOnclick: function(evt) {
      if (ret.isLoggedIn()) {
        ret.clearCache(true);
      }
      if (logoutURL) {
        return true; // allow manual override
      } else if (ret.interceptLogout) {
        logoutURL = this.href; // this == link associated with onclick evt
        return ret.interceptLogout();
      } else {
        return true;
      }
    },
    addOnLoggedIn: function(name, func) {
      onLoggedIn[name] = func;
    },
    addOnNotLoggedIn: function(name, func) {
      onNotLoggedIn[name] = func;
    },
    removeOnLoggedIn: function(name) {
      delete onLoggedIn[name];
    },
    removeOnNotLoggedIn: function(name) {
      delete onNotLoggedIn[name];
    },
    setOnLoggedIn: function(callbacks) {
      onLoggedIn = callbacks;
    },
    setOnNotLoggedIn: function(callbacks) {
      onNotLoggedIn = callbacks;
    },
    interceptLogout: undefined,
    proceedLogout: function() {
      if (logoutURL) {
        setTimeout(function() {window.location = logoutURL;}, 1000); // extra time for firefox to process PLUG logout
      }
    }
  };
  return ret;
};

module.exports = LOGIN;
