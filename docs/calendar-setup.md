# Enable optional Google Calendar reminders

Anchor reuses the existing Google Web Client ID. Calendar permission is requested
separately from Google sign-in when a resident clicks **Connect Google Calendar**.
The app sends a confirmed preview of selected, checked dates to the Calendar API;
it does not read existing events or send notice files and form answers.

## 1. Enable the Calendar API

Open [Google Calendar API in your project](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=pivotal-layout-476219-s5)
and click **Enable**. The project is `pivotal-layout-476219-s5`, the same project
that owns Anchor's Google Web Client ID.

Google requires enabling the API before making requests. See the
[official Calendar setup instructions](https://developers.google.com/workspace/calendar/api/quickstart/js).

## 2. Add the Calendar scope

Open [Google Auth Platform → Data Access](https://console.cloud.google.com/auth/scopes?project=pivotal-layout-476219-s5),
choose **Add or remove scopes**, and add this exact scope:

```text
https://www.googleapis.com/auth/calendar.events.owned
```

Select it from the enabled Calendar API scopes, or paste it into **Manually add
scopes**. Click **Update**, then **Save** if the page offers it. Keep the existing
OpenID, email, and profile scopes.

Google describes this permission as viewing, creating, changing, and deleting
events on calendars the user owns. Anchor currently uses it only to create the
confirmed reminders on the chosen Google account's primary calendar. The Google
consent screen displays the scope's broader permission honestly. See
[scope meanings](https://developers.google.com/workspace/calendar/api/auth) and
[Google's Data Access instructions](https://support.google.com/cloud/answer/15549135).

## 3. Keep the existing client configuration

You do not need a new client ID, Calendar API key, or Supabase provider secret.
Anchor uses Google Identity Services' browser token flow and authenticated REST
requests directly to Calendar.

The existing Web application client keeps:

| Setting                                      | Value                                                       |
| -------------------------------------------- | ----------------------------------------------------------- |
| Authorized JavaScript origin                 | `https://jaivardhansamadhiya.github.io`                     |
| Authorized redirect URI for Supabase sign-in | `https://rufgpepnoxpbpwmfhwzq.supabase.co/auth/v1/callback` |
| Supabase Site URL and allowed app redirect   | `https://jaivardhansamadhiya.github.io/Anchor/`             |

There is no new redirect URI for the Calendar popup. Its short-lived access token
stays in page memory and is not saved in the workspace or Supabase. See the
[Google Identity Services token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model).

## 4. Add test users and verify

In [Google Auth Platform → Audience](https://console.cloud.google.com/auth/audience?project=pivotal-layout-476219-s5),
keep **External / Testing** while setting up and add each account that will test
Calendar, including your own Gmail. Calendar requests go beyond the basic sign-in
scopes, so Testing's listed-user requirement applies. Google limits Testing to
100 test users and test authorizations expire after seven days. Reconnect when
asked. See [Google's Audience guide](https://support.google.com/cloud/answer/15549945).

In Anchor:

1. Use your personal workspace and add a fictional notice for testing.
2. Review the notice and confirm a date against its original.
3. Open **Calendar** and select the reminders you want.
4. Click **Connect Google Calendar**, choose the intended Google account, and
   grant Calendar permission.
5. Review the event preview and confirm creation. Check that the event appears
   in that Google account's primary calendar on the expected date.

Anchor uses generic titles, private visibility, all-day dates, and the calendar's
default reminders. A context date such as a certification end remains explicitly
described as a context reminder. The app does not create events automatically on
sign-in or page load. Fictional practice mode cannot write to Google Calendar.

If Google shows **API not enabled**, complete step 1. If it shows **access denied**,
check the test user and scope settings. If the popup is blocked, allow it for
Anchor and click the connection button again. The `.ics` download remains
available if direct Calendar connection is unavailable.

## Public launch and disconnection

Moving OAuth to **In production** does not by itself verify sensitive scopes.
Google may require scope verification, a justification, and a demonstration of
the Calendar consent and reminder flow before wider public use. Follow the
project's Google Auth Platform verification requirements; do not promise every
visitor can authorize Calendar while the app remains in Testing.

**Disconnect this session** clears Anchor's in-memory token and stops its current
connection. It does not revoke Google's permission grant or remove events. Users
can remove the grant at [Google account connections](https://myaccount.google.com/connections)
and manage created events in Google Calendar. Deleting an Anchor workspace also
does not remove external calendar events.

These settings were checked against Google's official documentation on
October 10, 2026. This guide does not claim the project's API toggle or consent
settings have been changed or that a live Calendar write has been tested.
