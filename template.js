const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const getCookieValues = require('getCookieValues');
const getContainerVersion = require('getContainerVersion');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const makeTableMap = require('makeTableMap');
const Math = require('Math');
const parseUrl = require('parseUrl');
const sendHttpRequest = require('sendHttpRequest');
const sendPixelFromBrowser = require('sendPixelFromBrowser');
const setCookie = require('setCookie');
const sha256Sync = require('sha256Sync');

// Call-once methods.
let gtmOnSuccess = () => {
  gtmOnSuccess = () => {};
  return data.gtmOnSuccess();
};

let gtmOnFailure = () => {
  gtmOnFailure = () => {};
  return data.gtmOnFailure();
};

/*==============================================================================
==============================================================================*/

const API_VERSION = '202604';
const eventData = getAllEventData();

if (shouldExitEarly(data, eventData)) return;

const actionHandlers = {
  page_view: handlePageViewEvent,
  conversion: handleConversionEvent
};

const handler = actionHandlers[data.type];
if (handler) {
  const error = handler(data, eventData);
  if (error) return;
} else {
  return gtmOnFailure();
}

if (data.useOptimisticScenario) {
  return gtmOnSuccess();
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function generateSendPixelFromBrowserUrl(partnerIds, clickId, url) {
  partnerIds = itemizeInput(partnerIds);
  if (getType(partnerIds) !== 'array' || partnerIds.length === 0) return;

  return (
    'https://px.ads.linkedin.com/collect?v=2&fmt=gif&pid=' +
    encodeUriComponent(partnerIds.join(',')) +
    '&time=' +
    getTimestampMillis() +
    (clickId ? '&li_fat_id=' + encodeUriComponent(clickId) : '') +
    '&url=' +
    encodeUriComponent(url)
  );
}

function handlePageViewEvent(data, eventData) {
  const url = getUrl(eventData);
  if (!url) {
    return gtmOnSuccess();
  }

  const clickId = parseClickIdFromSources(eventData);

  if (clickId) {
    const options = {
      domain: 'auto',
      path: '/',
      secure: true,
      httpOnly: false,
      'max-age': 86400 * 90
    };
    setCookie('li_fat_id', clickId, options, false);
  }

  if (data.enablePageViewFromBrowser) {
    const sendPixelFromBrowserUrl = generateSendPixelFromBrowserUrl(data.partnerIds, clickId, url);
    if (!sendPixelFromBrowserUrl) {
      log({
        Name: 'LinkedIn',
        Type: 'Message',
        EventName: data.type,
        Message: '🛑 [ERROR] Invalid browser PageView event URL.'
      });
      gtmOnFailure();
      return true;
    }

    const sendPixelFromBrowserSuccess = sendPixelFromBrowser(sendPixelFromBrowserUrl);
    if (!sendPixelFromBrowserSuccess) {
      log({
        Name: 'LinkedIn',
        Type: 'Message',
        EventName: data.type,
        Message:
          '⚠️ [WARNING] The requestor does not support sending pixels from browser. 3rd party cookies will not be collected as a result.'
      });
    }
  }

  return gtmOnSuccess();
}

function handleConversionEvent(data, eventData) {
  const postUrl = getRequestUrl();
  const postBody = getPostBody(data, eventData);
  const postHeaders = getRequestHeaders(data);

  const invalidOrMissingFields = validateMappedData(postBody);
  if (invalidOrMissingFields) {
    log({
      Name: 'LinkedIn',
      Type: 'Message',
      EventName: data.type,
      Message: '🛑 [ERROR] No conversion event was sent to LinkedIn CAPI.',
      Reason: invalidOrMissingFields
    });

    gtmOnFailure();
    return true;
  }

  sendConversionToLinkedIn(data, postUrl, postBody, postHeaders);
}

function validateMappedData(postBody) {
  const hasUserIds =
    getType(postBody.user) === 'object' &&
    getType(postBody.user.userIds) === 'array' &&
    postBody.user.userIds.some((userId) => userId.idValue);
  if (!hasUserIds) {
    return 'User IDs are missing. Set at least one of the following IDs (Email, LinkedIn First Party Ads Tracking UUID, ACXIOM ID, Oracle MOAT ID).';
  }

  const hasUserInfo =
    getType(postBody.user) === 'object' && getType(postBody.user.userInfo) === 'object';
  // Ignore empty strings to avoid breaking changes.
  const hasFirstAndLastName =
    hasUserInfo &&
    getType(postBody.user.userInfo.firstName) === 'string' &&
    getType(postBody.user.userInfo.lastName) === 'string';
  if (hasUserInfo && !hasFirstAndLastName) {
    return 'First Name and Last Name are missing. Set both First Name and Last Name when passing User Info data.';
  }
}

function sendConversionToLinkedIn(data, postUrl, postBody, postHeaders) {
  log({
    Name: 'LinkedIn',
    Type: 'Request',
    EventName: data.type,
    RequestMethod: 'POST',
    RequestUrl: postUrl,
    RequestBody: postBody
  });

  sendHttpRequest(
    postUrl,
    (statusCode, headers, body) => {
      log({
        Name: 'LinkedIn',
        Type: 'Response',
        EventName: data.type,
        ResponseStatusCode: statusCode,
        ResponseHeaders: headers,
        ResponseBody: body
      });

      if (!data.useOptimisticScenario) {
        return statusCode >= 200 && statusCode < 300 ? gtmOnSuccess() : gtmOnFailure();
      }
    },
    {
      headers: postHeaders,
      method: 'POST'
    },
    JSON.stringify(postBody)
  );
}

function getRequestUrl() {
  return 'https://api.linkedin.com/rest/conversionEvents';
}

function getRequestHeaders(data) {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + data.accessToken,
    'LinkedIn-Version': API_VERSION,
    'X-Restli-Protocol-Version': '2.0.0'
  };
}

function getPostBody(data, eventData) {
  const autoMapEventDataEnabled = data.hasOwnProperty('autoMapEventData')
    ? data.autoMapEventData
    : true; // To avoid a breaking change.
  const eventDataOverride = makeOverrideTableMap(data.eventData);

  const result = {
    conversion: getConversionRuleUrn(data),
    conversionHappenedAt: getConversionHappenedAt(
      eventData,
      eventDataOverride,
      autoMapEventDataEnabled
    ),
    eventId: getEventId(eventData, eventDataOverride, autoMapEventDataEnabled),
    user: {
      userIds: getUserIds(data, eventData),
      userInfo: getUserInfo(data, eventData),
      externalIds: getExternalIds(data, eventData)
    }
  };
  const conversionValue = getConversionValue(eventData, eventDataOverride, autoMapEventDataEnabled);
  if (conversionValue) result.conversionValue = conversionValue;
  return result;
}

function getExternalIds(data, eventData) {
  const externalIds = itemizeInput(data.externalIds);

  if (getType(externalIds) === 'array' && externalIds.length) {
    return externalIds;
  } else if (data.autoMapExternalIds && eventData.user_id) {
    return [makeString(eventData.user_id)];
  }
}

function getConversionRuleUrn(data) {
  return 'urn:lla:llaPartnerConversion:' + data.conversionRuleUrn;
}

function getConversionHappenedAt(eventData, eventDataOverride, autoMapEventDataEnabled) {
  if (eventDataOverride.conversionHappenedAt)
    return makeNumber(eventDataOverride.conversionHappenedAt);
  if (autoMapEventDataEnabled) {
    if (eventData.conversion_happened_at) return makeNumber(eventData.conversion_happened_at);
    if (eventData.event_time) return makeNumber(eventData.event_time);
    return Math.round(getTimestampMillis());
  }
}

function getConversionValue(eventData, eventDataOverride, autoMapEventDataEnabled) {
  let items;

  if (autoMapEventDataEnabled) {
    if (getType(eventData.items) === 'array' && eventData.items.length) {
      items = eventData.items;
    } else if (
      getType(eventData.ecommerce) === 'object' &&
      getType(eventData.ecommerce.items) === 'array' &&
      eventData.ecommerce.items.length
    ) {
      items = eventData.ecommerce.items;
    }
  }

  const hasItems = getType(items) === 'array' && !!items[0];

  const itemsCurrency = hasItems ? items[0].currency : '';
  const currencyCode =
    eventDataOverride.currency ||
    (autoMapEventDataEnabled ? eventData.currency || itemsCurrency : '') ||
    '';
  if (!currencyCode) return null;

  const itemsValue = hasItems
    ? items.reduce((acc, item) => {
        const price = item.price || 0;
        const quantity = item.quantity || 1;
        return acc + price * quantity;
      }, 0)
    : 0;
  const amount =
    eventDataOverride.amount || (autoMapEventDataEnabled ? eventData.value || itemsValue : 0) || 0;

  return {
    currencyCode: currencyCode,
    amount: makeString(amount)
  };
}

function getEventId(eventData, eventDataOverride, autoMapEventDataEnabled) {
  return (
    eventDataOverride.eventId ||
    (autoMapEventDataEnabled ? eventData.eventId || eventData.event_id : '') ||
    ''
  );
}

function getUserIds(data, eventData) {
  const autoMapEnabled = data.hasOwnProperty('autoMapUserIds') ? data.autoMapUserIds : true; // To avoid a breaking change.
  const userIdsOverride = makeOverrideTableMap(data.userIds);

  const userIds = [
    {
      idType: 'SHA256_EMAIL',
      idValue: hashData(getUserEmail(eventData, userIdsOverride, autoMapEnabled))
    },
    {
      idType: 'LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID',
      idValue: getLinkedInFirstPartyAdsTrackingUuid(eventData, userIdsOverride, autoMapEnabled)
    },
    {
      idType: 'ACXIOM_ID',
      idValue: getAcxiomId(eventData, userIdsOverride, autoMapEnabled)
    },
    {
      idType: 'ORACLE_MOAT_ID',
      idValue: getOracleMoatId(eventData, userIdsOverride, autoMapEnabled)
    }
  ];

  return userIds.filter((userId) => userId.idValue);
}

function getEmailAddressFromEventData(eventData) {
  const eventDataUserData = eventData.user_data || {};
  const email =
    eventData.email ||
    eventData.email_address ||
    eventDataUserData.email ||
    eventDataUserData.email_address ||
    eventDataUserData.sha256_email_address;
  const emailType = getType(email);

  if (emailType === 'string') return email;
  else if (emailType === 'array' || emailType === 'object') return email[0];

  return;
}

function getUserEmail(eventData, userIdsOverride, autoMapEnabled) {
  return (
    userIdsOverride.email || (autoMapEnabled ? getEmailAddressFromEventData(eventData) : '') || ''
  );
}

function parseClickIdFromSources(eventData) {
  const cookieName = 'li_fat_id';
  return (
    parseClickIdFromUrl(eventData, cookieName) ||
    getCookieValues(cookieName)[0] ||
    (eventData.common_cookie || {})[cookieName] ||
    eventData[cookieName] ||
    (eventData.user_data || {}).linkedinFirstPartyId
  );
}

function getLinkedInFirstPartyAdsTrackingUuid(eventData, userIdsOverride, autoMapEnabled) {
  return (
    userIdsOverride.linkedinFirstPartyId ||
    (autoMapEnabled ? parseClickIdFromSources(eventData) : '') ||
    ''
  );
}

function getAcxiomId(eventData, userIdsOverride, autoMapEnabled) {
  return (
    userIdsOverride.acxiomID || (autoMapEnabled ? (eventData.user_data || {}).acxiomID : '') || ''
  );
}

function getOracleMoatId(eventData, userIdsOverride, autoMapEnabled) {
  return userIdsOverride.moatID || (autoMapEnabled ? (eventData.user_data || {}).moatID : '') || '';
}

function getUserFirstName(eventData, userAddress, userInfoOverride, autoMapEnabled) {
  return (
    userInfoOverride.firstName ||
    (autoMapEnabled
      ? eventData.firstName ||
        eventData.FirstName ||
        eventData.nameFirst ||
        eventData.first_name ||
        (eventData.user_data || {}).first_name ||
        userAddress.first_name
      : '') ||
    ''
  );
}

function getUserLastName(eventData, userAddress, userInfoOverride, autoMapEnabled) {
  return (
    userInfoOverride.lastName ||
    (autoMapEnabled
      ? eventData.lastName ||
        eventData.LastName ||
        eventData.nameLast ||
        eventData.last_name ||
        (eventData.user_data || {}).last_name ||
        userAddress.last_name
      : '') ||
    ''
  );
}

function getUserJobTitle(eventData, userInfoOverride, autoMapEnabled) {
  const userData = eventData.user_data || {};
  return (
    userInfoOverride.jobTitle ||
    (autoMapEnabled ? eventData.jobTitle || userData.jobTitle || userData.job_title : '') ||
    ''
  );
}

function getUserCompanyName(eventData, userInfoOverride, autoMapEnabled) {
  const userData = eventData.user_data || {};
  return (
    userInfoOverride.companyName ||
    (autoMapEnabled
      ? eventData.companyName ||
        eventData.company_name ||
        userData.companyName ||
        userData.company_name
      : '') ||
    ''
  );
}

function getUserCountryCode(eventData, userAddress, userInfoOverride, autoMapEnabled) {
  return (
    userInfoOverride.countryCode ||
    (autoMapEnabled
      ? eventData.countryCode ||
        eventData.country ||
        (eventData.user_data || {}).country ||
        userAddress.country
      : '') ||
    ''
  );
}

function getUserInfo(data, eventData) {
  const autoMapEnabled = data.hasOwnProperty('autoMapUserInfo') ? data.autoMapUserInfo : true; // To avoid a breaking change.
  const userInfoOverride = makeOverrideTableMap(data.userInfo);

  const userData = eventData.user_data || {};
  let userAddress = userData.address;
  if (['array', 'object'].indexOf(getType(userAddress)) === -1) {
    userAddress = {};
  }
  userAddress = userAddress[0] || userAddress || {};

  return {
    firstName: getUserFirstName(eventData, userAddress, userInfoOverride, autoMapEnabled),
    lastName: getUserLastName(eventData, userAddress, userInfoOverride, autoMapEnabled),
    title: getUserJobTitle(eventData, userInfoOverride, autoMapEnabled),
    companyName: getUserCompanyName(eventData, userInfoOverride, autoMapEnabled),
    countryCode: getUserCountryCode(eventData, userAddress, userInfoOverride, autoMapEnabled)
  };
}

/*==============================================================================
  Helpers
==============================================================================*/

function getUrl(eventData) {
  return eventData.page_location || getRequestHeader('referer') || eventData.page_referrer;
}

function isConsentGivenOrNotRequired(data, eventData) {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function shouldExitEarly(data, eventData) {
  if (!isConsentGivenOrNotRequired(data, eventData)) {
    gtmOnSuccess();
    return true;
  }

  const url = getUrl(eventData);
  if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
    gtmOnSuccess();
    return true;
  }
}

function parseClickIdFromUrl(eventData, clickIdParamName) {
  const url = getUrl(eventData);
  if (!url) return;

  const urlSearchParams = parseUrl(url).searchParams;
  return urlSearchParams[clickIdParamName];
}

function isHashed(value) {
  if (!value) {
    return false;
  }

  return makeString(value).match('^[A-Fa-f0-9]{64}$') !== null;
}

function hashData(value) {
  if (!value) {
    return value;
  }

  const type = getType(value);

  if (type === 'undefined' || value === 'undefined') {
    return undefined;
  }

  if (type === 'object' || type === 'array') {
    return value;
  }

  if (isHashed(value)) {
    return value;
  }

  value = makeString(value).trim().toLowerCase();

  return sha256Sync(value, { outputEncoding: 'hex' });
}

function makeOverrideTableMap(values) {
  return makeTableMap(values || [], 'name', 'value') || {};
}

function itemizeInput(input) {
  const type = getType(input);
  if (type !== 'string' && type !== 'array') return;

  input = type === 'string' ? input.split(',') : input;
  if (getType(input) === 'array') {
    input = input.map((p) => makeString(p).trim()).filter((p) => p);
  }
  return input;
}

function log(rawDataToLog) {
  rawDataToLog.TraceId = getRequestHeader('trace-id');
  if (determinateIsLoggingEnabled()) logConsole(rawDataToLog);
}

function logConsole(dataToLog) {
  logToConsole(JSON.stringify(dataToLog));
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(
    containerVersion &&
    (containerVersion.debugMode || containerVersion.previewMode)
  );

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}
