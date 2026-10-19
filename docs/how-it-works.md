---
title: How usage is fetched
nav_order: 6
---

# How usage is fetched

The rate-limit windows come from the same first-party usage endpoint the built-in `/usage` command reads. NeonMeter asks Claude Code for an opaque credential handle and passes it to the engine's own HTTP call; the engine attaches your account credential to the request itself. The plugin never sees, stores or logs the credential. It also takes the windows the engine reports after each response, and fetches only when the newest reading is older than `pollSeconds`.

The endpoint limits how often an account may ask, so every open session shares one schedule through the plugin store: one session fetches per period and the others show what it fetched. The fetch runs every period whether or not Claude Code has just reported the 5-hour and all-models windows after a reply, because the per-model weekly limits come only from the endpoint; those windows show the endpoint's newest figure within a period of the reply that moved them, and the endpoint itself can run a little behind the live counters Claude Code's own usage popup reads. When the endpoint answers 429, every session waits twice as long as before, up to 30 minutes, until a fetch succeeds again. The last reading is cached in the plugin's store, so a new session shows it at once, live while it is younger than twice `pollSeconds` and marked stale with its age after that, until the first fetch lands.

The context segment is the size of the last request: the input tokens the model's last response was answered over, cached and uncached together, against the model's context window, as Claude Code measures it. Claude Code sends that measurement after each turn, so the context moves when a reply finishes, while the rate-limit windows also refresh between turns. Claude Code's own context indicator can read a little higher at the same moment, because it counts a larger figure than the last request's input; Claude Code also tracks the size of the next request, which adds the last reply's tokens. NeonMeter shows the measured input, unchanged.

The context's breakdown comes from the engine as well: at the session's start and after each response the plugin asks for the same breakdown `/context` lists, estimated locally (no request is sent), which takes the engine about 20 ms, and only while the context bar or its card shows it. The button submits its prompt through the engine's own prompt call, the one a typed prompt takes, as your own words; nothing else runs.

To follow the desktop app's appearance under `desktopTheme: auto`, the plugin reads the app's own theme setting from its config file and, when the app follows the system, asks the operating system once a minute: `reg query` on Windows, `defaults read` on macOS, `gsettings get` on GNOME. Besides that it reads Claude Code's own theme setting and the `APPDATA`, `HOME`, `USERPROFILE` and `XDG_CONFIG_HOME` variables to find that file. Nothing else is read or run, and nothing is sent anywhere but the usage endpoint.
