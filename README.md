# External Object Test App

A standalone iframe application for manually and automatically validating parent-page messaging and dynamic iframe resizing.

It implements a `ready`, `readycheck`, `data`, and `height` `postMessage` protocol and provides controls for dynamic content, valid heights, a 10,000-pixel cap, and invalid height values.

## Requirements

- Node.js 18 or newer
- A parent application that implements the same messaging protocol
- The parent page must use HTTP or HTTPS

The project has no package dependencies. Do not run `npm install`.

## Start the app

From PowerShell:

```powershell
npm start -- --parent-origin https://your-parent-host.example
```

The app listens at `http://127.0.0.1:4173` by default. Available options:

```text
--parent-origin <origin>  Exact parent application origin, without a path
--host <host>             Listening interface (default: 127.0.0.1)
--port <port>             Listening port (default: 4173)
```

Environment equivalents are `PARENT_ORIGIN`, `HOST`, and `PORT`. Command-line values take precedence.

For temporary local testing, the parent origin may be supplied in the page URL:

```text
http://127.0.0.1:4173/?parentOrigin=https%3A%2F%2Fyour-parent-host.example
```

The query parameter takes precedence over server configuration. It changes the browser messaging target but not the server's `frame-ancestors` policy, so start the server with the actual parent origin when embedding the page.

## Configure a registered application

1. Start this app with the exact origin of the parent application.
2. Make the app reachable by the browser running the parent application. For remote environments, use an approved HTTPS development host or reverse proxy; `127.0.0.1` is usable only by the same workstation.
3. Enable registered External Object applications in the parent application.
4. Register a test application whose redirect URI is this app's URL, such as `http://127.0.0.1:4173/`.
5. Create an **External Object** field with type **Registered Application** and select that application.
6. Add parameter mappings to verify inbound `data` messages.
7. Open a record containing the field.

Expected results:

- Status changes from **Waiting for parent application** to **Connected**.
- The event log records `ready`, `readycheck`, `data`, and `height` traffic.
- Parent parameters appear in the **Parent parameters** panel.
- The iframe changes from its initial fallback height to the app's measured pixel height.

## Configure cross-origin URL mode

1. Start this app on an origin different from the parent application. A different scheme, hostname, or port is sufficient.
2. Create an **External Object** field with type **URL**.
3. Set its URL to this app's URL.
4. Open a record containing the field.

Because this app implements the messaging protocol, cross-origin URL mode should complete the handshake and receive height updates. A URL that does not implement the protocol should remain at the parent application's fallback height after the handshake timeout.

## Manual scenarios

### Dynamic increase and decrease

1. Confirm the app is connected.
2. Select **Add content** several times.
3. Confirm the parent application grows the iframe and avoids an inner scrollbar.
4. Select **Remove content** and confirm the iframe shrinks.
5. Disable **Send changes automatically**, add content, and confirm the parent height does not change.
6. Select **Send measured height** and confirm it catches up.

### Independent instances

1. Place two External Object fields on one parent record, both pointing to this app.
2. Add content in only one iframe.
3. Confirm only that iframe changes height.
4. Inspect each event log to confirm traffic remains isolated to its own window.

### Boundary validation

Use **Boundary and invalid values**:

- **Send 10,001 px**: the parent application should cap the iframe at `10,000px`.
- **Send zero**: the parent application should ignore the value.
- **Send malformed value**: the parent application should ignore the value.
- Enter any integer or text in **Manual height value** to test additional cases.

### Reconnect and cleanup

Reload the parent record or switch away from and back to its tab. The app should reconnect without duplicate log entries for a single message. Browser console output should not show same-origin timeout warnings when testing a same-origin URL.

## Automated tests

```powershell
npm test
```

Tests cover server routing and headers, origin/source filtering, handshake behavior, height measurement and observation, configuration precedence, safe payload formatting, and bounded event logging.

## Security notes

- The server and browser require an explicit HTTP(S) parent origin.
- Outbound messages never use `*`.
- Inbound messages must match both the configured origin and `window.parent`.
- Parameter payloads are rendered with `textContent`; HTML is not interpreted.
- The server blocks path traversal and sends a restrictive Content Security Policy.
