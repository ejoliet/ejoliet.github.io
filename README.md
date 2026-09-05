# ejoliet.github.io

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/I3I5BSV5J)

Go [here](https://ejoliet.github.io) to see this repos acting as HTML landing page coded here [index.html](index.html)  

Trick for https:

```
brew install cloudflared
python3 -m http.server 8093
cloudflared tunnel --url http://localhost:8093
```
Will create a temporary https to test websites.
