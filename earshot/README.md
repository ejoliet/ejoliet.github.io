<p align="center">
  <img src="logo.svg" width="112" height="112" alt="earshot logo">
</p>

<h1 align="center">earshot</h1>

<p align="center"><strong>Send a command to a laptop by sound. No Wi-Fi, no Bluetooth, no cable, no server.</strong></p>

<p align="center">
  Type a command on your phone, hold it near the laptop, and the laptop hears it.<br>
  Works only within earshot, which is the whole point.
</p>

---

## How it works

```
  phone / any browser                          laptop terminal
 ┌─────────────────────┐                     ┌─────────────────────┐
 │  earshot.html       │   ♪♪♪ ~1.8 s ♪♪♪    │  $ ./earshot        │
 │  code:  329921      │  ─────────────────▶ │  PAIR CODE: 329921  │
 │  cmd:   uptime      │   audible chirp     │  Received: 'uptime' │
 │  [ Send by sound ]  │                     │  Run? [y/N] y       │
 └─────────────────────┘                     └─────────────────────┘
```

1. Run `./earshot` on the laptop. It prints a six-digit code and listens on the microphone.
2. Open `earshot.html` on the other device. Enter the code and a command. Press **Send by sound**.
3. The laptop decodes the chirp. If the text exactly matches the allowlist, it asks you to confirm, then runs it.
4. Each code is single use. A fresh code appears after every accepted message.

The sound modem is [ggwave](https://github.com/ggerganov/ggwave). Payloads are short text, up to 140 bytes.

## Quick start

### Laptop (the receiver)

Needs Python via [uv](https://docs.astral.sh/uv/getting-started/installation/) and PortAudio. One-time setup while online:

```sh
# Ubuntu / Debian
sudo apt-get install libportaudio2
# macOS: nothing extra, PortAudio ships with the sounddevice wheel

chmod +x earshot
./earshot --list-devices      # pick your microphone ID
```

Then listen:

```sh
./earshot                     # default microphone
./earshot --device 2          # specific microphone
```

Once dependencies are cached, it runs fully offline:

```sh
EARSHOT_OFFLINE=1 ./earshot
```

### Phone or second laptop (the sender)

Open `earshot.html` in any modern browser. For offline use, put `ggwave.js` next to it:

```sh
curl -fL https://cdn.jsdelivr.net/npm/ggwave@0.4.0/ggwave.js -o ggwave.js
```

Without the local file, the page falls back to the CDN and needs internet once.

Sender needs a speaker. Receiver needs a microphone. Turn the volume up and hold the devices within about a metre.

## What can run

By default only these exact strings execute:

```
uptime   date   hostname   whoami   pwd   id   uname -a   df -h   free -h
```

Use your own list, one command per line, exact match only:

```sh
printf '%s\n' 'systemctl --user restart my-service' 'journalctl --user -n 10 --no-pager' > allow.txt
./earshot --allow-file allow.txt
```

Other options:

| Flag | Effect |
|---|---|
| `--print-only` | Show received text, never execute. Good for sending notes or URLs. |
| `--once` | Exit after the first accepted message. |
| `--device N` | Use microphone `N` from `--list-devices`. |
| `--allow-file F` | Replace the default allowlist with the lines of `F`. |

## Security, honestly

- **Nothing runs automatically.** The text must match the allowlist byte for byte, and you must type `y` on the laptop.
- **The six-digit code is a session check, not encryption.** Anyone in the room can hear the chirp. The code is consumed on first use, so a recording cannot be replayed.
- **Short range by design.** If they are not in earshot, they cannot send.
- **No network at all** during transmission. Only the one-time dependency download touches the internet.

Treat it like shouting a command across the room to a colleague who checks a list before acting.

## Tested

- Encode in the browser library, decode in the Python receiver: pass.
- Real speaker to microphone on a MacBook Pro, live random code: received and verified.
- Wrong code: ignored. Command not on list: blocked. On list plus `y`: executed, exit code shown.
- `earshot.html` loads and reaches **Ready** from a plain `file://` URL with `ggwave.js` beside it. The wasm is embedded, no extra files.

## Files

| File | Purpose |
|---|---|
| `earshot` | Receiver. Bash wrapper around a single Python script, run with `uv`. |
| `earshot.html` | Sender. One static page, no build step. |
| `logo.svg` | The icon above. |

## Credits

[ggwave](https://github.com/ggerganov/ggwave) by Georgi Gerganov. Inspired by [chirp-pong](https://github.com/simonw/tools/blob/main/chirp-pong.html) by Simon Willison.
