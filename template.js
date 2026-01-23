const decodeUriComponent = require('decodeUriComponent');
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
const setCookie = require('setCookie');
const sha256Sync = require('sha256Sync');

/*==============================================================================
==============================================================================*/

const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = isLoggingEnabled ? getRequestHeader('trace-id') : undefined;
const cookieName = 'li_fat_id';

const eventData = getAllEventData();

if (!isConsentGivenOrNotRequired()) {
  return data.gtmOnSuccess();
}

if (data.type === 'page_view') {
  const url = eventData.page_location || getRequestHeader('referer');

  if (url) {
    const value = parseUrl(url).searchParams[cookieName];

    if (value) {
      const options = {
        domain: 'auto',
        path: '/',
        secure: true,
        httpOnly: false,
        'max-age': 86400 * 90
      };

      setCookie(cookieName, value, options, false);
    }
  }

  return data.gtmOnSuccess();
}

const user_data = eventData.user_data || {};

let user_address = user_data.address;
if (['array', 'object'].indexOf(getType(user_address)) === -1) {
  user_address = {};
}
user_address = user_address[0] || user_address || {};

const eventDataOverride = makeOverrideTableMap(data.eventData);
const userIdsOverride = makeOverrideTableMap(data.userIds);
const userInfoOverride = makeOverrideTableMap(data.userInfo);

const postUrl = getRequestUrl();
const postBody = getPostBody();
const postHeaders = getRequestHeaders();

if (isLoggingEnabled) {
  logToConsole(
    JSON.stringify({
      Name: 'LinkedIn',
      Type: 'Request',
      TraceId: traceId,
      EventName: postBody.eventId,
      RequestMethod: 'POST',
      RequestUrl: postUrl,
      RequestBody: postBody
    })
  );
}

// perform validation check on presence of 1/4 of the required IDs. If at least 1 ID is present, make the API call. If no IDs are present, log the warning and no call is made
if (validateUserData()) {
  sendConversionToLinkedIn();
} else {
  if (isLoggingEnabled) {
    logToConsole(
      JSON.stringify({
        Name: 'LinkedIn',
        Type: 'Message',
        TraceId: traceId,
        EventName: postBody.eventId,
        Message: 'No conversion event was sent to LinkedIn CAPI.',
        Reason:
          'You must set 1 out of the 4 acceptable IDs (SHA256_EMAIL, LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID, ACXIOM_ID, ORACLE_MOAT_ID) to resolve this issue or make certain to send both firstName and lastName.'
      })
    );
  }

  data.gtmOnFailure();
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function validateUserData() {
  if (postBody.user.userIds.length > 0) {
    return true;
  }

  return postBody.user.userInfo.firstName && postBody.user.userInfo.lastName;
}

function sendConversionToLinkedIn() {
  sendHttpRequest(
    postUrl,
    (statusCode, headers, body) => {
      if (isLoggingEnabled) {
        logToConsole(
          JSON.stringify({
            Name: 'LinkedIn',
            Type: 'Response',
            TraceId: traceId,
            EventName: postBody.eventId,
            ResponseStatusCode: statusCode,
            ResponseHeaders: headers,
            ResponseBody: body
          })
        );
      }

      if (statusCode >= 200 && statusCode < 300) {
        data.gtmOnSuccess();
      } else {
        data.gtmOnFailure();
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

function getRequestHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + data.accessToken,
    'LinkedIn-Version': '202601',
    'X-Restli-Protocol-Version': '2.0.0'
  };
}

function getPostBody() {
  const result = {
    conversion: getConversionRuleUrn(),
    conversionHappenedAt: getConversionHappenedAt(),
    eventId: getEventId(),
    user: {
      userIds: getUserIds(),
      userInfo: getUserInfo()
    }
  };
  const conversionValue = getConversionValue();
  if (conversionValue) result.conversionValue = conversionValue;
  return result;
}

function getConversionRuleUrn() {
  return 'urn:lla:llaPartnerConversion:' + data.conversionRuleUrn;
}

function getConversionHappenedAt() {
  if (eventDataOverride.conversionHappenedAt)
    return makeNumber(eventDataOverride.conversionHappenedAt);
  if (eventData.conversion_happened_at) return makeNumber(eventData.conversion_happened_at);
  if (eventData.event_time) return makeNumber(eventData.event_time);
  return Math.round(getTimestampMillis());
}

function getConversionValue() {
  const hasItems = getType(eventData.items) === 'array' && !!eventData.items[0];
  const itemsCurrency = hasItems ? eventData.items[0].currency : '';
  const currencyCode = eventDataOverride.currency || eventData.currency || itemsCurrency;
  if (!currencyCode) return null;
  const itemsValue = hasItems
    ? eventData.items.reduce((acc, item) => {
        const price = item.price || 0;
        const quantity = item.quantity || 1;
        return acc + price * quantity;
      }, 0)
    : 0;
  const amount = eventDataOverride.amount || eventData.value || itemsValue;
  return {
    currencyCode: currencyCode,
    amount: makeString(amount)
  };
}

function getEventId() {
  return eventDataOverride.eventId || eventData.eventId || eventData.event_id || '';
}

function getUserIds() {
  const userIds = [
    {
      idType: 'SHA256_EMAIL',
      idValue: hashData(getUserEmail())
    },
    {
      idType: 'LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID',
      idValue: getLinkedInFirstPartyAdsTrackingUuid()
    },
    {
      idType: 'ACXIOM_ID',
      idValue: getAcxiomId()
    },
    {
      idType: 'ORACLE_MOAT_ID',
      idValue: getOracleMoatId()
    }
  ];

  return userIds.filter((userId) => userId.idValue);
}

function getUserEmail() {
  return (
    userIdsOverride.email || eventData.email || user_data.email_address || user_data.email || ''
  );
}

function getLinkedInFirstPartyAdsTrackingUuid() {
  const liFatId = decodeUriComponent(getCookieValues(cookieName)[0] || '');
  return liFatId || userIdsOverride.linkedinFirstPartyId || user_data.linkedinFirstPartyId || '';
}

function getAcxiomId() {
  return userIdsOverride.acxiomID || user_data.acxiomID || '';
}

function getOracleMoatId() {
  return userIdsOverride.moatID || user_data.moatID || '';
}

function getUserFirstName() {
  return (
    userInfoOverride.firstName ||
    eventData.firstName ||
    eventData.FirstName ||
    eventData.nameFirst ||
    eventData.first_name ||
    user_data.first_name ||
    user_address.first_name ||
    ''
  );
}

function getUserLastName() {
  return (
    userInfoOverride.lastName ||
    eventData.lastName ||
    eventData.LastName ||
    eventData.nameLast ||
    eventData.last_name ||
    user_data.last_name ||
    user_address.last_name ||
    ''
  );
}

function getUserJobTitle() {
  return (
    userInfoOverride.jobTitle ||
    eventData.jobTitle ||
    user_data.jobTitle ||
    user_data.job_title ||
    ''
  );
}

function getUserCompanyName() {
  return (
    userInfoOverride.companyName ||
    eventData.companyName ||
    eventData.company_name ||
    user_data.companyName ||
    user_data.company_name ||
    ''
  );
}

function getUserCountryCode() {
  return (
    userInfoOverride.countryCode ||
    eventData.countryCode ||
    eventData.country ||
    user_data.country ||
    user_address.country ||
    ''
  );
}

function getUserInfo() {
  return {
    firstName: getUserFirstName(),
    lastName: getUserLastName(),
    title: getUserJobTitle(),
    companyName: getUserCompanyName(),
    countryCode: getUserCountryCode()
  };
}

/*==============================================================================
Helpers
==============================================================================*/

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

function isConsentGivenOrNotRequired() {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}
