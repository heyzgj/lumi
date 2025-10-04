# LUMI Native Host

Implements the Chrome Native Messaging host to bridge the extension with local AI CLIs.

Files
- `index.js` — Node.js host (stdin/stdout protocol, capability probe, CLI exec, git apply)
- `config.json` — Copy from `config.sample.json` and set absolute project paths
- `com.lumi.host.json` — Native host manifest (macOS/Linux); edit `path` to point to `runner.sh`
- `runner.sh` — Small launcher with shebang to run `node index.js` (make it executable: `chmod +x runner.sh`)

macOS install paths
- Manifest path: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.lumi.host.json`

Test
- From the extension background console: send `LUMI_HOST_PING` and confirm `{ ok: true, caps: ... }`

