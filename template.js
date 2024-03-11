const getAllEventData = require('getAllEventData');
const JSON = require('JSON');
const sendHttpRequest = require('sendHttpRequest');
const getContainerVersion = require('getContainerVersion');
const logToConsole = require('logToConsole');
const sha256Sync = require('sha256Sync');
const getRequestHeader = require('getRequestHeader');
const getType = require('getType');
const makeString = require('makeString');
const encodeUriComponent = require('encodeUriComponent');
const getTimestampMillis = require('getTimestampMillis');
const Math = require('Math');
const makeNumber = require('makeNumber');
const makeTableMap = require('makeTableMap');
const getCookieValues = require('getCookieValues');
const decodeUriComponent = require('decodeUriComponent');

const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = isLoggingEnabled ? getRequestHeader('trace-id') : undefined;

const eventData = getAllEventData();
const user_data = eventData.user_data || {};
const user_address = user_data.address || {};
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

function getRequestUrl() {
  return 'https://api.linkedin.com/rest/conversionEvents';
}

function getRequestHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + data.accessToken,
    'LinkedIn-Version': '202304',
    'X-Restli-Protocol-Version': '2.0.0'
  };
}

function getPostBody() {
  return {
    conversion: getConversionRuleUrn(),
    conversionHappenedAt: getConversionHappenedAt(),
    conversionValue: getConversionValue(),
    eventId: getEventId(),
    user: {
      userIds: getUserIds(),
      userInfo: getUserInfo()
    }
  };
}

function getConversionRuleUrn() {
  return 'urn:lla:llaPartnerConversion:' + data.conversionRuleUrn;
}

function getConversionHappenedAt() {
  if (eventDataOverride.conversionHappenedAt)
    return makeNumber(eventDataOverride.conversionHappenedAt);
  if (eventData.conversion_happened_at)
    return makeNumber(eventData.conversion_happened_at);
  if (eventData.event_time) return makeNumber(eventData.event_time);
  return Math.round(getTimestampMillis());
}

function getConversionValue() {
  const hasItems = getType(eventData.items) === 'array' && !!eventData.items[0];
  const itemsCurrency = hasItems ? eventData.items[0].currency : 'NA?';
  const itemsValue = hasItems
    ? eventData.items[0].reduce((acc, item) => {
        const price = item.price || 0;
        const quantity = item.quantity || 1;
        return acc + price * quantity;
      }, 0)
    : 0;
  const currencyCode =
    eventDataOverride.currency || eventData.currency || itemsCurrency;
  const amount = eventDataOverride.amount || eventData.value || itemsValue;
  return {
    currencyCode: currencyCode,
    amount: makeString(amount)
  };
}

function getEventId() {
  return (
    eventDataOverride.eventId || eventData.eventId || eventData.event_id || ''
  );
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

function getUserIdFactory(idType, getIdValue) {
  return {
    idType: idType,
    idValue: getIdValue
  };
}

function getUserEmail() {
  return (
    userIdsOverride.email ||
    eventData.email ||
    user_data.email_address ||
    user_data.email ||
    ''
  );
}

function getLinkedInFirstPartyAdsTrackingUuid() {
  const liFatId = decodeUriComponent(getCookieValues('li_fat_id')[0] || '');
  return (
    liFatId ||
    userIdsOverride.linkedinFirstPartyId ||
    user_data.linkedinFirstPartyId ||
    ''
  );
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

function enc(data) {
  return encodeUriComponent(data || '');
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
