/*
 * Maven chat widget.
 *
 * Embed:   <script src="https://YOUR_HOST/widget.js" data-maven-key="pk_..." async></script>
 * Options (data attributes): data-mode="bubble|inline|search|phone", data-target="#css-selector"
 *          (inline, search and phone modes), data-open="true" (bubble starts open).
 *          "search" renders a large, centered search-style box; answers appear below it.
 *          "phone" renders a phone mockup with a messaging-app conversation (channel preview).
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

  // POSTs a message and feeds each server-sent event to onEvent(event, data).
  function postChat(key, body, onEvent) {
    return fetch(API + "/api/widget/" + encodeURIComponent(key) + "/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok || !res.body) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          throw new Error(j.error || "Request failed");
        });
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buf = "";
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
            var parsed;
            try { parsed = JSON.parse(data); } catch (err) { return; }
            onEvent(ev, parsed);
          });
          return pump();
        });
      }
      return pump();
    });
  }

  function loadConfig(key) {
    return fetch(API + "/api/widget/" + encodeURIComponent(key) + "/config").then(function (r) {
      return r.ok ? r.json() : Promise.reject(r);
    });
  }

  function mount(opts) {
    unmount();
    opts = opts || {};
    if (!opts.key) throw new Error("MavenWidget: missing key");
    var mode = opts.mode === "inline" || opts.mode === "search" || opts.mode === "phone" ? opts.mode : "bubble";
    var target = typeof opts.target === "string" ? document.querySelector(opts.target) : opts.target;
    if (mode !== "bubble" && !target) mode = "bubble";
    if (mode === "search") return mountSearch(opts, target);
    if (mode === "phone") return mountPhone(opts, target);

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

    loadConfig(opts.key)
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

      postChat(opts.key, { message: text, conversationId: state.conversationId, role: opts.role || undefined }, handle)
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

  // ---------- search mode ----------

  var SEARCH_CSS = [
    ":host{all:initial;display:block}",
    "*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}",
    ".s{max-width:720px;margin:0 auto;color:#202124}",
    ".s-greet{text-align:center;color:#5f6368;font-size:15px;margin:0 0 16px}",
    ".s-bar{position:relative;z-index:5;padding:10px 0}",
    // Once a conversation starts: thread on top, input pinned to the bottom of the screen (chat-app layout).
    ".s.active{display:flex;flex-direction:column;min-height:var(--minh,auto)}",
    ".s.active .s-thread{order:1;flex:1}",
    ".s.active .s-bar{order:2;position:sticky;bottom:0;padding:18px 0 8px;background:linear-gradient(to top,var(--bg) 78%,transparent)}",
    ".s.active .s-foot{order:3;margin-top:2px;padding-bottom:8px}",
    ".s-box{display:flex;align-items:center;gap:12px;height:58px;padding:0 8px 0 20px;border:1px solid #dfe1e5;border-radius:29px;background:#fff;transition:box-shadow .2s,border-color .2s}",
    ".s-box:hover,.s-box:focus-within{box-shadow:0 1px 6px rgba(32,33,36,.28);border-color:rgba(223,225,229,0)}",
    ".s-mag{width:20px;height:20px;color:#9aa0a6;flex:none}",
    ".s-box input{flex:1;min-width:0;border:0;outline:0;background:transparent;font-size:17px;color:#202124}",
    ".s-box input::placeholder{color:#80868b}",
    ".s-clear{border:0;background:none;color:#70757a;font-size:24px;line-height:1;cursor:pointer;padding:4px 6px;display:none}",
    ".s-box.has-text .s-clear{display:block}",
    ".s-go{width:42px;height:42px;border-radius:50%;border:0;background:var(--c);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;transition:opacity .15s}",
    ".s-go:disabled{opacity:.35;cursor:default}",
    ".s-go svg{width:18px;height:18px}",
    ".s-chips{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:20px}",
    ".s-chip{border:1px solid #dadce0;background:#f8f9fa;border-radius:20px;padding:9px 16px;font-size:14px;color:#3c4043;cursor:pointer}",
    ".s-chip:hover{background:#f1f3f4;border-color:#c6c6c6;box-shadow:0 1px 1px rgba(0,0,0,.1)}",
    ".s.active .s-greet,.s.active .s-chips{display:none}",
    ".s-qa{padding:22px 4px;border-bottom:1px solid #ebebeb;animation:in .25s ease-out}",
    "@keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
    ".s-q{font-size:22px;line-height:1.3;color:#202124;margin:0 0 12px}",
    ".s-tag{font-size:12px;color:#5f6368;margin:-4px 0 10px}.s-tag b{background:#eef2ff;color:#4338ca;border-radius:999px;padding:1px 8px;font-weight:600}",
    ".s-a{font-size:16px;line-height:1.65;color:#3c4043;word-wrap:break-word}",
    ".s-a p{margin:0 0 10px}.s-a p:last-child{margin:0}",
    ".s-a ul{margin:6px 0 10px;padding-left:22px}.s-a li{margin:2px 0}",
    ".s-a blockquote{margin:6px 0;padding-left:12px;border-left:3px solid #dadce0;color:#4d5156}",
    ".s-a a{color:#1a0dab}",
    ".s-a.err{color:#b3261e}",
    ".s-src{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}",
    ".s-src a{font-size:12px;color:#4d5156;border:1px solid #dadce0;border-radius:14px;padding:5px 11px;text-decoration:none;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".s-src a:hover{background:#f8f9fa}",
    ".dots{display:inline-flex;gap:5px;padding:6px 0}.dots span{width:8px;height:8px;border-radius:50%;background:#bdc1c6;animation:b 1.2s infinite}",
    ".dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}",
    "@keyframes b{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}",
    ".s-foot{display:flex;justify-content:center;gap:14px;align-items:center;font-size:12px;color:#9aa0a6;margin-top:18px}",
    ".s-reset{border:0;background:none;color:#5f6368;font-size:13px;cursor:pointer;text-decoration:underline;display:none}",
    ".s.active .s-reset{display:inline}",
    "@media (max-width:480px){.s-box{height:52px;padding-left:16px}.s-q{font-size:19px}.s-box input{font-size:16px}}",
  ].join("\n");

  var ICON_SEARCH = '<svg class="s-mag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  var ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var CHIPS = {
    support: "What are your opening hours?",
    sales: "What services do you offer?",
    appointments: "I'd like to book an appointment",
  };

  function mountSearch(opts, target) {
    var host = document.createElement("div");
    host.setAttribute("data-maven-widget", "");
    target.appendChild(host);
    var root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      "<style>" + SEARCH_CSS + "</style>" +
      '<div class="s">' +
      '<p class="s-greet"></p>' +
      '<div class="s-bar"><form class="s-box" role="search">' + ICON_SEARCH +
      '<input type="text" enterkeyhint="search" autocomplete="off" aria-label="Ask a question" placeholder="Ask anything…" />' +
      '<button class="s-clear" type="button" aria-label="Clear">×</button>' +
      '<button class="s-go" type="submit" aria-label="Ask" disabled>' + ICON_ARROW + "</button>" +
      "</form></div>" +
      '<div class="s-chips"></div>' +
      '<div class="s-thread" aria-live="polite"></div>' +
      '<div class="s-foot"><button class="s-reset" type="button">Start over</button><span>Powered by Maven</span></div>' +
      "</div>";

    var $ = function (sel) { return root.querySelector(sel); };
    var wrap = $(".s"), form = $(".s-box"), input = $("input"), go = $(".s-go"), thread = $(".s-thread");
    wrap.style.setProperty("--c", "#4f46e5");
    wrap.style.setProperty("--bg", opts.background || "#fff");
    if (opts.minHeight) wrap.style.setProperty("--minh", opts.minHeight);
    var storeKey = "maven:" + opts.key + ":" + (opts.role || "auto");
    var state = { conversationId: store(storeKey) || null, busy: false, history: [] };
    try {
      state.history = JSON.parse(store(storeKey + ":h") || "[]");
    } catch (e) {}

    function persist(entry) {
      state.history.push(entry);
      state.history = state.history.slice(-40);
      store(storeKey + ":h", JSON.stringify(state.history));
    }
    function sync() {
      var has = input.value.trim().length > 0;
      form.classList.toggle("has-text", input.value.length > 0);
      go.disabled = !has || state.busy;
    }
    function activate() {
      if (!wrap.classList.contains("active")) {
        wrap.classList.add("active");
        host.dispatchEvent(new CustomEvent("maven:active", { bubbles: true, composed: true }));
      }
    }
    function addQuestion(text) {
      var qa = document.createElement("div");
      qa.className = "s-qa";
      var q = document.createElement("h2");
      q.className = "s-q";
      q.textContent = text;
      qa.appendChild(q);
      thread.appendChild(qa);
      return qa;
    }
    function addAnswer(qa, agent) {
      if (opts.preview && agent) {
        var t = document.createElement("div");
        t.className = "s-tag";
        t.innerHTML = "<b>" + esc(agent.name) + "</b> agent";
        qa.appendChild(t);
      }
      var a = document.createElement("div");
      a.className = "s-a";
      qa.appendChild(a);
      return a;
    }
    function addSources(qa, sources) {
      // Show page names only ("Contact", not "Contact | Business Name"), and
      // skip the internal header/footer snippet.
      var shown = (sources || []).filter(function (x) { return !/^Site-wide information/.test(x.title); });
      if (!shown.length) return;
      var s = document.createElement("div");
      s.className = "s-src";
      s.innerHTML = shown.map(function (x) {
        var label = x.title.split(/\s[|\u2013\u2014-]\s/)[0] || x.title;
        return '<a href="' + esc(x.url) + '" target="_blank" rel="noopener" title="' + esc(x.title) + '">' + esc(label) + "</a>";
      }).join("");
      qa.appendChild(s);
    }
    // Scroll so the bottom of el sits just above the input pinned at the bottom.
    function follow(el, smooth) {
      if (!el) return;
      var bar = $(".s-bar").getBoundingClientRect().height;
      var top = el.getBoundingClientRect().bottom + window.pageYOffset - window.innerHeight + bar + 24;
      if (top > window.pageYOffset) window.scrollTo({ top: top, behavior: smooth ? "smooth" : "auto" });
    }
    // Follow a streaming answer only while the reader hasn't scrolled up to read something.
    var pinned = true;
    window.addEventListener("scroll", function () {
      if (!host.isConnected || !wrap.classList.contains("active")) return;
      var last = thread.lastElementChild;
      if (!last) return;
      var bar = $(".s-bar").getBoundingClientRect();
      pinned = last.getBoundingClientRect().bottom <= bar.top + 80;
    }, { passive: true });

    loadConfig(opts.key)
      .then(function (cfg) {
        wrap.style.setProperty("--c", cfg.color || "#4f46e5");
        $(".s-greet").textContent = cfg.greeting || "";
        input.placeholder = "Ask " + (cfg.businessName || "us") + " anything…";
        $(".s-chips").innerHTML = (cfg.agents || [])
          .filter(function (a) { return CHIPS[a.role]; })
          .map(function (a) { return '<button type="button" class="s-chip">' + esc(CHIPS[a.role]) + "</button>"; })
          .join("");
        root.querySelectorAll(".s-chip").forEach(function (chip) {
          chip.addEventListener("click", function () { ask(chip.textContent); });
        });
      })
      .catch(function () {
        $(".s-greet").textContent = "Search is unavailable right now.";
      });

    // Restore this visitor's earlier questions.
    var lastQa = null;
    state.history.forEach(function (h) {
      if (h.kind === "user") lastQa = addQuestion(h.text);
      else if (lastQa) {
        addAnswer(lastQa, h.agent).innerHTML = md(h.text);
        addSources(lastQa, h.sources);
      }
    });
    if (state.history.length) {
      wrap.classList.add("active");
      if (opts.autofocus !== false) requestAnimationFrame(function () { follow(thread.lastElementChild, false); });
    }

    input.addEventListener("input", sync);
    $(".s-clear").addEventListener("click", function () {
      input.value = "";
      sync();
      input.focus();
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      ask(input.value);
    });
    $(".s-reset").addEventListener("click", function () {
      store(storeKey, null);
      store(storeKey + ":h", null);
      state.conversationId = null;
      state.history = [];
      thread.innerHTML = "";
      wrap.classList.remove("active");
      host.dispatchEvent(new CustomEvent("maven:reset", { bubbles: true, composed: true }));
      window.scrollTo({ top: 0, behavior: "smooth" });
      input.focus();
    });

    function ask(raw) {
      var text = (raw || "").trim();
      if (!text || state.busy) return;
      state.busy = true;
      input.value = "";
      sync();
      activate();
      persist({ kind: "user", text: text });
      var qa = addQuestion(text);
      var typing = document.createElement("div");
      typing.className = "s-a";
      typing.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
      qa.appendChild(typing);
      pinned = true;
      requestAnimationFrame(function () { follow(qa, true); });
      var answer = null, reply = "", agent = null, sources = null, failed = false;

      function showError(message) {
        failed = true;
        typing.remove();
        var a = answer || addAnswer(qa, null);
        a.classList.add("err");
        a.textContent = message;
      }

      postChat(opts.key, { message: text, conversationId: state.conversationId, role: opts.role || undefined }, function (event, data) {
        if (event === "meta") {
          state.conversationId = data.conversationId;
          store(storeKey, data.conversationId);
          agent = data.agent;
        } else if (event === "delta") {
          if (!answer) {
            typing.remove();
            answer = addAnswer(qa, agent);
          }
          reply += data.text;
          answer.innerHTML = md(reply);
          if (pinned) follow(qa, false);
        } else if (event === "done") {
          sources = data.sources;
          addSources(qa, sources);
          if (pinned) follow(qa, false);
        } else if (event === "error") {
          showError(data.message + (opts.preview && data.detail ? " (" + data.detail + ")" : ""));
        }
      })
        .catch(function (err) {
          showError(err.message || "Something went wrong. Please try again.");
        })
        .then(function () {
          if (!answer && !failed) typing.remove();
          if (reply) persist({ kind: "bot", text: reply, agent: agent, sources: sources });
          state.busy = false;
          sync();
          input.focus();
        });
    }

    if (opts.autofocus !== false && !state.history.length) setTimeout(function () { input.focus(); }, 50);

    mounted = {
      host: host,
      open: function () { input.focus(); },
      reset: function () {
        store(storeKey, null);
        store(storeKey + ":h", null);
      },
    };
    return mounted;
  }

  // ---------- phone mode (messaging-app preview) ----------

  var PHONE_CSS = [
    ":host{all:initial;display:block}",
    "*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}",
    ".device{width:360px;max-width:100%;height:720px;margin:0 auto;border-radius:48px;background:#111;padding:12px;box-shadow:0 20px 50px rgba(0,0,0,.25),inset 0 0 0 2px #333;position:relative}",
    ".notch{position:absolute;top:12px;left:50%;transform:translateX(-50%);width:120px;height:26px;background:#111;border-radius:0 0 16px 16px;z-index:3}",
    ".screen{width:100%;height:100%;border-radius:38px;overflow:hidden;display:flex;flex-direction:column;background:#efeae2}",
    ".status{height:34px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:4px 26px 0;font-size:13px;font-weight:600;color:#fff;background:var(--c)}",
    ".status svg{height:12px;margin-left:4px}",
    ".bar{flex:none;display:flex;align-items:center;gap:10px;padding:8px 12px 10px;background:var(--c);color:#fff}",
    ".bar .back{font-size:22px;line-height:1;opacity:.9}",
    ".av{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-weight:700;flex:none}",
    ".who{flex:1;min-width:0}.who b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.who span{font-size:12px;opacity:.85}",
    ".icons{display:flex;gap:16px;opacity:.9}.icons svg{width:20px;height:20px}",
    ".msgs{flex:1;overflow-y:auto;padding:12px 10px;display:flex;flex-direction:column;gap:4px;background-color:#efeae2;background-image:radial-gradient(rgba(0,0,0,.035) 1px,transparent 1px);background-size:16px 16px}",
    ".day{align-self:center;background:#fff;color:#54656f;font-size:11px;padding:4px 10px;border-radius:8px;margin:4px 0 8px;box-shadow:0 1px .5px rgba(0,0,0,.13)}",
    ".b{max-width:82%;padding:6px 8px 4px 9px;border-radius:8px;font-size:14px;line-height:1.4;color:#111b21;box-shadow:0 1px .5px rgba(0,0,0,.13);word-wrap:break-word;animation:pop .15s ease-out}",
    "@keyframes pop{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}",
    ".b.in{align-self:flex-start;background:#fff;border-top-left-radius:2px}",
    ".b.out{align-self:flex-end;background:#d9fdd3;border-top-right-radius:2px}",
    ".b.err{align-self:center;background:#fff3f2;color:#b3261e;font-size:13px}",
    ".b p{margin:0 0 4px}.b p:last-of-type{margin-bottom:0}.b ul{margin:2px 0 4px;padding-left:18px}",
    ".b blockquote{margin:2px 0;padding-left:8px;border-left:3px solid #c8d0d4;color:#3b4a54}",
    ".b a{color:#027eb5}",
    ".meta{float:right;margin:6px 0 -2px 10px;font-size:11px;color:#667781;display:flex;align-items:center;gap:3px}",
    ".tick{width:16px;height:11px;color:#8696a0}.tick.read{color:#53bdeb}",
    ".tag{align-self:flex-start;font-size:10px;color:#54656f;margin:6px 0 0 4px}.tag b{background:#e7e9ff;color:#4338ca;border-radius:999px;padding:1px 7px}",
    ".dots{display:inline-flex;gap:4px;padding:6px 2px}.dots span{width:7px;height:7px;border-radius:50%;background:#8696a0;animation:bl 1.2s infinite}",
    ".dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}",
    "@keyframes bl{0%,80%,100%{opacity:.3}40%{opacity:1}}",
    ".quick{display:flex;gap:6px;overflow-x:auto;padding:6px 10px 0;background:#efeae2;flex:none;scrollbar-width:none}",
    ".quick button{flex:none;border:1px solid #d1d7db;background:#fff;color:#111b21;border-radius:16px;padding:6px 12px;font-size:12px;cursor:pointer}",
    ".compose{flex:none;display:flex;align-items:center;gap:8px;padding:8px 8px 14px;background:#efeae2}",
    ".pill{flex:1;display:flex;align-items:center;gap:8px;background:#fff;border-radius:22px;padding:0 14px;height:44px;box-shadow:0 1px .5px rgba(0,0,0,.13)}",
    ".pill svg{width:22px;height:22px;color:#8696a0;flex:none}",
    ".pill input{flex:1;min-width:0;border:0;outline:0;font-size:15px;background:transparent;color:#111b21}",
    ".send{width:44px;height:44px;border-radius:50%;border:0;background:var(--c);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none}",
    ".send:disabled{opacity:.5;cursor:default}.send svg{width:20px;height:20px}",
    ".home{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);width:120px;height:4px;border-radius:2px;background:rgba(0,0,0,.35)}",
    "@media (max-width:400px){.device{height:640px;border-radius:40px}}",
  ].join("\n");

  var ICON_TICK = '<svg class="tick" viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6l3 3 6-7M6 8.5l1 .5 6-7"/></svg>';

  function hhmm() {
    var d = new Date();
    return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
  }

  function mountPhone(opts, target) {
    var host = document.createElement("div");
    host.setAttribute("data-maven-widget", "");
    target.appendChild(host);
    var root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      "<style>" + PHONE_CSS + "</style>" +
      '<div class="device"><div class="notch"></div><div class="screen">' +
      '<div class="status"><span class="clock">' + hhmm() + '</span><span>' +
      '<svg viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2" width="3" height="10" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>' +
      '<svg viewBox="0 0 26 12" fill="none" stroke="currentColor"><rect x=".5" y=".5" width="22" height="11" rx="3"/><rect x="2.5" y="2.5" width="16" height="7" rx="1.5" fill="currentColor"/><path d="M24.5 4v4" stroke-linecap="round"/></svg></span></div>' +
      '<div class="bar"><span class="back">‹</span><div class="av">·</div><div class="who"><b class="name">Business</b><span class="state">online</span></div>' +
      '<div class="icons"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/></svg>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg></div></div>' +
      '<div class="msgs" aria-live="polite"><div class="day">Today</div></div>' +
      '<div class="quick"></div>' +
      '<form class="compose"><div class="pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke-linecap="round"/></svg>' +
      '<input type="text" placeholder="Message" aria-label="Message" autocomplete="off" /></div>' +
      '<button class="send" type="submit" aria-label="Send" disabled>' + ICON_SEND + "</button></form>" +
      '</div><div class="home"></div></div>';

    var $ = function (sel) { return root.querySelector(sel); };
    var device = $(".device"), msgs = $(".msgs"), input = $("input"), send = $(".send"), stateEl = $(".state");
    device.style.setProperty("--c", "#4f46e5");
    var storeKey = "maven:" + opts.key + ":" + (opts.role || "auto");
    var state = { conversationId: store(storeKey) || null, busy: false, history: [] };
    try {
      state.history = JSON.parse(store(storeKey + ":h") || "[]");
    } catch (e) {}
    var clock = setInterval(function () {
      if (!host.isConnected) return clearInterval(clock);
      $(".clock").textContent = hhmm();
    }, 30000);

    function persist(entry) {
      state.history.push(entry);
      state.history = state.history.slice(-40);
      store(storeKey + ":h", JSON.stringify(state.history));
    }
    function scroll() { msgs.scrollTop = msgs.scrollHeight; }
    function bubble(kind, text, time) {
      var el = document.createElement("div");
      el.className = "b " + kind;
      var body = document.createElement("div");
      if (kind === "out") body.textContent = text;
      else body.innerHTML = md(text);
      el.appendChild(body);
      var meta = document.createElement("span");
      meta.className = "meta";
      meta.innerHTML = esc(time || hhmm()) + (kind === "out" ? ICON_TICK : "");
      el.appendChild(meta);
      msgs.appendChild(el);
      scroll();
      return { el: el, body: body };
    }
    function tag(agent) {
      if (!opts.preview || !agent) return;
      var t = document.createElement("div");
      t.className = "tag";
      t.innerHTML = "<b>" + esc(agent.name) + "</b> agent";
      msgs.appendChild(t);
    }
    function sync() { send.disabled = !input.value.trim() || state.busy; }

    loadConfig(opts.key)
      .then(function (cfg) {
        device.style.setProperty("--c", cfg.color || "#4f46e5");
        $(".name").textContent = cfg.businessName || cfg.assistantName;
        $(".av").textContent = (cfg.businessName || "A").trim().charAt(0).toUpperCase();
        if (!state.history.length) bubble("in", cfg.greeting || "Hi! How can I help?");
        $(".quick").innerHTML = (cfg.agents || [])
          .filter(function (a) { return CHIPS[a.role]; })
          .map(function (a) { return "<button type=\"button\">" + esc(CHIPS[a.role]) + "</button>"; })
          .join("");
        root.querySelectorAll(".quick button").forEach(function (b) {
          b.addEventListener("click", function () { ask(b.textContent); });
        });
        if (state.history.length) $(".quick").style.display = "none";
      })
      .catch(function () { bubble("err", "Chat is unavailable right now."); });

    state.history.forEach(function (h) {
      if (h.kind === "user") {
        var u = bubble("out", h.text, h.time);
        u.el.querySelector(".tick").classList.add("read");
      } else {
        tag(h.agent);
        bubble("in", h.text, h.time);
      }
    });

    input.addEventListener("input", sync);
    $(".compose").addEventListener("submit", function (e) {
      e.preventDefault();
      ask(input.value);
    });

    function ask(raw) {
      var text = (raw || "").trim();
      if (!text || state.busy) return;
      state.busy = true;
      input.value = "";
      sync();
      $(".quick").style.display = "none";
      var time = hhmm();
      var out = bubble("out", text, time);
      persist({ kind: "user", text: text, time: time });
      var typing = null;
      // A short pause before "typing…" feels like a real contact reading the message.
      var typingTimer = setTimeout(function () {
        out.el.querySelector(".tick").classList.add("read");
        stateEl.textContent = "typing…";
        typing = document.createElement("div");
        typing.className = "b in";
        typing.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
        msgs.appendChild(typing);
        scroll();
      }, 350);
      var reply = "", agent = null, view = null, failed = false;
      function clearTyping() {
        clearTimeout(typingTimer);
        out.el.querySelector(".tick").classList.add("read");
        if (typing) typing.remove();
        typing = null;
      }

      postChat(opts.key, { message: text, conversationId: state.conversationId, role: opts.role || undefined }, function (event, data) {
        if (event === "meta") {
          state.conversationId = data.conversationId;
          store(storeKey, data.conversationId);
          agent = data.agent;
        } else if (event === "delta") {
          if (!view) {
            clearTyping();
            tag(agent);
            view = bubble("in", "");
          }
          reply += data.text;
          view.body.innerHTML = md(reply);
          scroll();
        } else if (event === "error") {
          failed = true;
          clearTyping();
          bubble("err", data.message + (opts.preview && data.detail ? " (" + data.detail + ")" : ""));
        }
      })
        .catch(function (err) {
          failed = true;
          clearTyping();
          bubble("err", err.message || "Message not delivered. Please try again.");
        })
        .then(function () {
          clearTyping();
          stateEl.textContent = "online";
          if (reply) persist({ kind: "bot", text: reply, agent: agent, time: hhmm() });
          state.busy = false;
          sync();
          if (opts.autofocus !== false) input.focus();
        });
    }

    mounted = {
      host: host,
      open: function () { input.focus(); },
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
