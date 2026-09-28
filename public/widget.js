/*
 * Maven chat widget.
 *
 * Embed:   <script src="https://YOUR_HOST/widget.js" data-maven-key="pk_..." async></script>
 * Options (data attributes): data-mode="bubble|inline", data-target="#css-selector" (inline mode),
 *          data-open="true" (start open).
 * JS API:  MavenWidget.mount({ key, mode, target, open, role, preview }) / MavenWidget.unmount()
 */
(function () {
  "use strict";
  var script = document.currentScript || document.querySelector("script[data-maven-key]");
  var API = script && script.src ? new URL(script.src).origin : location.origin;
  var mounted = null;

  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
    ".launcher{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;background:var(--c);color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;z-index:2147483646;transition:transform .15s}",
    ".launcher:hover{transform:scale(1.06)}",
    ".launcher svg{width:28px;height:28px}",
    ".panel{display:flex;flex-direction:column;background:#fff;color:#111827;overflow:hidden}",
    ".bubble .panel{position:fixed;right:20px;bottom:92px;width:380px;height:600px;max-height:calc(100vh - 112px);border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.18);z-index:2147483647;transform-origin:bottom right;transition:opacity .15s,transform .15s}",
    ".bubble .panel.closed{opacity:0;transform:scale(.95);pointer-events:none}",
    "@media (max-width:480px){.bubble .panel{right:0;bottom:0;width:100vw;height:100%;max-height:100%;border-radius:0}}",
    ".wrap.inline{height:100%}",
    ".inline .panel{width:100%;height:100%;min-height:420px;border-radius:16px;border:1px solid #e5e7eb}",
    ".inline .launcher{display:none}",
    ".head{background:var(--c);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}",
    ".avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-weight:700;flex:none}",
    ".title{font-weight:600;font-size:15px;line-height:1.2}",
    ".status{font-size:12px;opacity:.85;display:flex;align-items:center;gap:5px}",
    ".status i{width:7px;height:7px;border-radius:50%;background:#4ade80;display:inline-block}",
    ".x{margin-left:auto;background:none;border:0;color:#fff;cursor:pointer;font-size:22px;line-height:1;opacity:.85;padding:4px}",
    ".inline .x{display:none}",
    ".msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f9fafb}",
    ".m{max-width:85%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.5;word-wrap:break-word;white-space:normal}",
    ".m.user{align-self:flex-end;background:var(--c);color:#fff;border-bottom-right-radius:4px}",
    ".m.bot{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:4px}",
    ".m.err{align-self:center;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;font-size:13px}",
    ".m a{color:inherit;text-decoration:underline}",
    ".m.bot a{color:var(--c)}",
    ".m p{margin:0 0 6px}.m p:last-child{margin:0}",
    ".m ul{margin:4px 0;padding-left:18px}",
    ".m blockquote{margin:4px 0;padding-left:10px;border-left:3px solid #e5e7eb;color:#374151}",
    ".tag{align-self:flex-start;font-size:11px;color:#6b7280;margin:4px 0 -6px 4px;display:flex;gap:6px;align-items:center}",
    ".tag b{background:#eef2ff;color:#4338ca;border-radius:999px;padding:1px 8px;font-weight:600}",
    ".src{font-size:11px;color:#6b7280;margin-top:6px}.src a{color:#6b7280}",
    ".dots{display:inline-flex;gap:4px;padding:4px 0}.dots span{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:b 1.2s infinite}",
    ".dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}",
    "@keyframes b{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}",
    "form{display:flex;gap:8px;padding:12px;border-top:1px solid #e5e7eb;background:#fff}",
    "textarea{flex:1;resize:none;border:1px solid #d1d5db;border-radius:10px;padding:10px 12px;font-size:14px;max-height:120px;outline:none;color:#111827;background:#fff}",
    "textarea:focus{border-color:var(--c);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 20%,transparent)}",
    ".send{border:0;border-radius:10px;background:var(--c);color:#fff;width:44px;cursor:pointer;display:flex;align-items:center;justify-content:center}",
    ".send:disabled{opacity:.5;cursor:default}",
    ".send svg{width:18px;height:18px}",
    ".brand{text-align:center;font-size:11px;color:#9ca3af;padding:0 0 8px;background:#fff}",
  ].join("\n");

  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';

  function esc(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Minimal, safe markdown: input is escaped first, then a few inline forms are
  // re-enabled. Links become placeholders so emphasis rules can't touch URLs.
  function inline(s) {
    var links = [];
    var hold = function (href, label) {
      links.push('<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + "</a>");
      return "\u0000" + (links.length - 1) + "\u0000";
    };
    s = s
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (_, label, href) { return hold(href, label); })
      .replace(/(^|[\s(])(https?:\/\/[^\s<)\u0000]+)/g, function (_, pre, href) { return pre + hold(href, href); })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return links[+i]; });
  }
  function md(text) {
    var out = [];
    var list = null;
    esc(text).split("\n").forEach(function (line) {
      var li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
      if (li) {
        list = list || [];
        list.push("<li>" + inline(li[1]) + "</li>");
        return;
      }
      if (list) {
        out.push("<ul>" + list.join("") + "</ul>");
        list = null;
      }
      if (!line.trim()) return;
      var q = line.match(/^&gt;\s?(.*)/);
      if (q) out.push("<blockquote>" + inline(q[1]) + "</blockquote>");
      else out.push("<p>" + inline(line.replace(/^#+\s*/, "")) + "</p>");
    });
    if (list) out.push("<ul>" + list.join("") + "</ul>");
    return out.join("");
  }

  function store(key, value) {
    try {
      if (value === undefined) return sessionStorage.getItem(key);
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch (e) {
      return null;
    }
  }

  function mount(opts) {
    unmount();
    opts = opts || {};
    if (!opts.key) throw new Error("MavenWidget: missing key");
    var mode = opts.mode === "inline" ? "inline" : "bubble";
    var target = typeof opts.target === "string" ? document.querySelector(opts.target) : opts.target;
    if (mode === "inline" && !target) mode = "bubble";

    var host = document.createElement("div");
    host.setAttribute("data-maven-widget", "");
    if (mode === "inline") {
      host.style.cssText = "display:block;width:100%;height:100%";
      target.appendChild(host);
    } else {
      document.body.appendChild(host);
    }
    var root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      "<style>" + CSS + "</style>" +
      '<div class="wrap ' + mode + '">' +
      '<button class="launcher" aria-label="Open chat">' + ICON_CHAT + "</button>" +
      '<div class="panel' + (mode === "bubble" && !opts.open ? " closed" : "") + '" role="dialog" aria-label="Chat">' +
      '<div class="head"><div class="avatar">·</div><div><div class="title">Assistant</div><div class="status"><i></i>Online</div></div>' +
      '<button class="x" aria-label="Close chat">×</button></div>' +
      '<div class="msgs" aria-live="polite"></div>' +
      '<form><textarea rows="1" placeholder="Type your message…" aria-label="Message"></textarea>' +
      '<button class="send" type="submit" aria-label="Send">' + ICON_SEND + "</button></form>" +
      '<div class="brand">Powered by Maven</div>' +
      "</div></div>";

    var $ = function (s) { return root.querySelector(s); };
    var wrap = $(".wrap"), panel = $(".panel"), msgs = $(".msgs"), input = $("textarea"), send = $(".send"), launcher = $(".launcher");
    var storeKey = "maven:" + opts.key + ":" + (opts.role || "auto");
    var state = { conversationId: store(storeKey) || null, busy: false, greeted: false, history: [] };
    try {
      state.history = JSON.parse(store(storeKey + ":h") || "[]");
    } catch (e) {}

    function setOpen(open) {
      panel.classList.toggle("closed", !open);
      launcher.innerHTML = open ? ICON_CLOSE : ICON_CHAT;
      launcher.setAttribute("aria-label", open ? "Close chat" : "Open chat");
      if (open) setTimeout(function () { input.focus(); }, 50);
    }
    launcher.addEventListener("click", function () { setOpen(panel.classList.contains("closed")); });
    $(".x").addEventListener("click", function () { setOpen(false); });

    function scroll() { msgs.scrollTop = msgs.scrollHeight; }
    function addTag(agent) {
      if (!opts.preview || !agent) return;
      var t = document.createElement("div");
      t.className = "tag";
      t.innerHTML = "<b>" + esc(agent.name) + "</b> agent";
      msgs.appendChild(t);
    }
    function addMsg(kind, text) {
      var el = document.createElement("div");
      el.className = "m " + kind;
      if (kind === "user") el.textContent = text;
      else el.innerHTML = md(text);
      msgs.appendChild(el);
      scroll();
      return el;
    }
    function persist(entry) {
      state.history.push(entry);
      state.history = state.history.slice(-40);
      store(storeKey + ":h", JSON.stringify(state.history));
    }

    fetch(API + "/api/widget/" + encodeURIComponent(opts.key) + "/config")
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
      .then(function (cfg) {
        wrap.style.setProperty("--c", cfg.color || "#4f46e5");
        $(".title").textContent = cfg.assistantName;
        $(".avatar").textContent = (cfg.assistantName || "A").trim().charAt(0).toUpperCase();
        addMsg("bot", cfg.greeting || "Hi! How can I help?");
        state.history.forEach(function (h) {
          if (h.agent) addTag(h.agent);
          addMsg(h.kind, h.text);
        });
      })
      .catch(function () {
        wrap.style.setProperty("--c", "#4f46e5");
        addMsg("err", "Chat is unavailable right now.");
      });

    input.addEventListener("input", function () {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        $("form").requestSubmit();
      }
    });

    $("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text || state.busy) return;
      input.value = "";
      input.style.height = "auto";
      addMsg("user", text);
      persist({ kind: "user", text: text });
      ask(text);
    });

    function ask(text) {
      state.busy = true;
      send.disabled = true;
      var typing = addMsg("bot", "");
      typing.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
      var bubble = null, reply = "", agent = null, failed = false;

      fetch(API + "/api/widget/" + encodeURIComponent(opts.key) + "/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: state.conversationId, role: opts.role || undefined }),
      })
        .then(function (res) {
          if (!res.ok || !res.body) {
            return res.json().catch(function () { return {}; }).then(function (j) {
              throw new Error(j.error || "Request failed");
            });
          }
          var reader = res.body.getReader();
          var decoder = new TextDecoder();
          var buf = "";
          function handle(event, data) {
            if (event === "meta") {
              state.conversationId = data.conversationId;
              store(storeKey, data.conversationId);
              agent = data.agent;
            } else if (event === "delta") {
              if (!bubble) {
                typing.remove();
                addTag(agent);
                bubble = addMsg("bot", "");
              }
              reply += data.text;
              bubble.innerHTML = md(reply);
              scroll();
            } else if (event === "done") {
              if (opts.preview && data.sources && data.sources.length && bubble) {
                var s = document.createElement("div");
                s.className = "src";
                s.innerHTML = "Sources: " + data.sources.map(function (x) {
                  return '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.title.slice(0, 40)) + "</a>";
                }).join(" · ");
                bubble.appendChild(s);
                scroll();
              }
            } else if (event === "error") {
              failed = true;
              typing.remove();
              addMsg("err", data.message + (opts.preview && data.detail ? "\n\nDetails: " + data.detail : ""));
            }
          }
          function pump() {
            return reader.read().then(function (r) {
              if (r.done) return;
              buf += decoder.decode(r.value, { stream: true });
              var parts = buf.split("\n\n");
              buf = parts.pop();
              parts.forEach(function (part) {
                var ev = "message", data = "";
                part.split("\n").forEach(function (line) {
                  if (line.indexOf("event: ") === 0) ev = line.slice(7);
                  else if (line.indexOf("data: ") === 0) data += line.slice(6);
                });
                try { handle(ev, JSON.parse(data)); } catch (err) {}
              });
              return pump();
            });
          }
          return pump();
        })
        .catch(function (err) {
          failed = true;
          typing.remove();
          addMsg("err", err.message || "Something went wrong. Please try again.");
        })
        .then(function () {
          if (!bubble && !failed) typing.remove();
          if (reply) persist({ kind: "bot", text: reply, agent: agent });
          state.busy = false;
          send.disabled = false;
          input.focus();
        });
    }

    mounted = {
      host: host,
      open: function () { setOpen(true); },
      reset: function () {
        store(storeKey, null);
        store(storeKey + ":h", null);
      },
    };
    return mounted;
  }

  function unmount() {
    if (mounted) {
      mounted.host.remove();
      mounted = null;
    }
  }

  window.MavenWidget = {
    mount: mount,
    unmount: unmount,
    open: function () { if (mounted) mounted.open(); },
    /** Forget the current conversation for this key/role and remount. */
    reset: function (opts) { if (mounted) mounted.reset(); return mount(opts); },
  };

  if (script && script.getAttribute("data-maven-key") && script.getAttribute("data-manual") !== "true") {
    var auto = function () {
      mount({
        key: script.getAttribute("data-maven-key"),
        mode: script.getAttribute("data-mode") || "bubble",
        target: script.getAttribute("data-target"),
        open: script.getAttribute("data-open") === "true",
      });
    };
    if (document.body) auto();
    else document.addEventListener("DOMContentLoaded", auto);
  }
})();
