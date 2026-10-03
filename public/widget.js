/*
 * Maven chat widget.
 *
 * Embed:   <script src="https://YOUR_HOST/widget.js" data-maven-key="pk_..." async></script>
 * Options (data attributes): data-mode="bubble|inline|search", data-target="#css-selector" (inline
 *          and search modes), data-open="true" (bubble starts open).
 *          "search" renders a large, centered search-style box; answers appear below it.
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
    var mode = opts.mode === "inline" || opts.mode === "search" ? opts.mode : "bubble";
    var target = typeof opts.target === "string" ? document.querySelector(opts.target) : opts.target;
    if (mode !== "bubble" && !target) mode = "bubble";
    if (mode === "search") return mountSearch(opts, target);

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
    ".s-bar{position:sticky;top:0;z-index:5;padding:10px 0;background:var(--bg)}",
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
    function reveal(el) {
      // Keep the new question just below the sticky search bar.
      var bar = $(".s-bar").getBoundingClientRect().height;
      var top = el.getBoundingClientRect().top + window.pageYOffset - bar - 12;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }

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
    if (state.history.length) wrap.classList.add("active");

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
      requestAnimationFrame(function () { reveal(qa); });
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
        } else if (event === "done") {
          sources = data.sources;
          addSources(qa, sources);
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
