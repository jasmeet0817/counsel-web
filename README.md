# Counsel Web

## Install dependencies

```
npm install
```

## Run locally

```
npm start
```

Opens at https://localhost:3003

## HTTPS Setup

HTTPS is required for microphone access in the browser. The server uses local TLS certificates generated with [mkcert](https://github.com/FiloSottile/mkcert).

### Generate certificates (first time only)

Download mkcert and generate certs for localhost:

```bash
curl -Lo /tmp/mkcert https://dl.filippo.io/mkcert/latest?for=linux/amd64
chmod +x /tmp/mkcert
/tmp/mkcert -install
/tmp/mkcert localhost 127.0.0.1 ::1
```

This creates `localhost+2.pem` and `localhost+2-key.pem` in the project root, which `server.js` reads automatically.

### Trust the certificate in your browser

The mkcert CA may not be auto-trusted without sudo. To avoid browser warnings, visit https://localhost:3003 and accept the certificate manually, or run `mkcert -install` with sudo to install the CA into the system trust store.
