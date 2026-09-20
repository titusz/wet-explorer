# Local HTTPS fixture

This self-signed certificate and disposable private key serve recorded test data on loopback port 43872. They have no production or authentication role and are excluded from the published site. Performance tests accept this certificate only in their isolated browser context. A loopback proxy on port 43873 tunnels only `data.commoncrawl.org:443` to that fixture server and rejects other destinations. The app's own loopback static files bypass the proxy.

The streaming server sends bounded chunks and stops on cancellation, avoiding the native-memory overhead of repeatedly fulfilling multi-megabyte response bodies through the browser debugger.

The proxy also preserves Firefox worker cancellation. With Playwright request interception, a minimal worker probe kept transferring after abort; the same worker without interception stopped the connection. Performance fixtures therefore keep the production request URL intact and use no debugger request interception.
