# ejoliet.github.io

Go [here](https://ejoliet.github.io) to see this repos acting as HTML landing page coded here [index.html](index.html)  

## SnapSplit

A new static app lives at [/snapsplit/](snapsplit/) with its own deployment notes and acceptance checklist in [snapsplit/README.md](snapsplit/README.md).

Trick for https:

```
brew install cloudflared
python3 -m http.server 8093
cloudflared tunnel --url http://localhost:8093
```
Will create a temporary https to test websites.
