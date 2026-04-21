# LinkedIn Conversion API Tag for Google Tag Manager Server Container

The **LinkedIn Conversion API tag for server Google Tag Manager** enables sending conversion and page view data directly to LinkedIn, improving data accuracy and reducing discrepancies caused by browser limitations and ad blockers.

## Event Types

### Page View
Stores the `li_fat_id` URL parameter in the `li_fat_id` cookie to enable first-party click ID tracking across sessions.

Optionally, enable **PageView from the Browser** to send a pixel directly from the user's browser to LinkedIn's pixel endpoint. This enables audience building via third-party cookies. Requires one or more **Partner IDs**.

### Conversion
Sends conversion event data to the [LinkedIn Conversions API](https://learn.microsoft.com/en-us/linkedin/marketing/conversion-tracking/conversion-api/overview). Requires an **Access Token** and a **Conversion ID**.

The tag automatically reads and maps standard event data fields. Auto-mapping can be individually disabled for **Event Data**, **User IDs**, and **User Info** — for example, to take full control via the override tables.

**Use Optimistic Scenario** — triggers `gtmOnSuccess()` immediately without waiting for a LinkedIn API response, improving sGTM response time at the cost of always reporting a success status.

## Override Settings

All overrides take precedence over auto-mapped values:

- **Event Data** — Conversion Happened At, Currency, Amount, Event ID
- **User IDs** — SHA256 Email, LinkedIn First Party Ads Tracking UUID, ACXIOM ID, Oracle MOAT ID
- **User Info** — First Name, Last Name, Job Title, Company Name, Country Code
- **External IDs** — external identifiers linked to users

## Useful links

- [LinkedIn Conversion API tag in the Template Gallery](https://tagmanager.google.com/gallery/#/owners/stape-io/templates/linkedin-tag)
- [LinkedIn Conversion API Tag for server GTM step-by-step guide](https://stape.io/blog/linkedin-conversion-api-tag-for-server-google-tag-manager)

## Open Source

The **LinkedIn Tag for GTM Server Side** is developed and maintained by [Stape Team](https://stape.io/) under the Apache 2.0 license.
