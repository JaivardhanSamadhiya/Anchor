# Google sign-in setup

Anchor now uses GitHub Pages and Supabase. Follow [the Pages and Supabase setup guide](PAGES_SETUP.md) for the SQL migration, Google provider configuration, public repository variables, and a real cross-device verification.

The Google Authorized JavaScript origin is https://jaivardhansamadhiya.github.io (without /Anchor/). The Google client secret belongs only in Supabase's Google provider settings; never put it in GitHub variables or browser code.

## Consent-screen branding

Use the following public URLs and contact details in Google Auth Platform → Branding:

| Field                             | Value                                                     |
| --------------------------------- | --------------------------------------------------------- |
| App name                          | Anchor                                                    |
| User support email                | jaisamadhiya@gmail.com                                    |
| Application home page             | https://jaivardhansamadhiya.github.io/Anchor/             |
| Application privacy policy link   | https://jaivardhansamadhiya.github.io/Anchor/privacy.html |
| Application terms of service link | https://jaivardhansamadhiya.github.io/Anchor/terms.html   |
| Developer contact email           | jaisamadhiya@gmail.com                                    |

Add these authorized domains without a scheme or path:

- `jaivardhansamadhiya.github.io`
- `rufgpepnoxpbpwmfhwzq.supabase.co`

Both `github.io` and `supabase.co` appear on the [Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat), so the project hostnames above are the registrable domains. Do not substitute the shared hosting-provider domains. Google may require domain ownership verification before production branding verification.

You can leave the optional logo empty during setup. Keep Audience → External → Testing and add your own Gmail address as a test user while completing sign-in configuration. Use only the basic `openid`, email, and profile scopes. See [Google's branding requirements](https://support.google.com/cloud/answer/15549049) and [Supabase's Google provider guide](https://supabase.com/docs/guides/auth/social-login/auth-google).

The policy pages are static HTML, require no login or JavaScript, and are linked directly from the homepage. Keep their descriptions consistent with the actual app whenever processing or storage changes.
