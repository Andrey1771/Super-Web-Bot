// Страницы Keycloak в стиле Tale Shop: витрина из обложек справа, подзаголовок, «Вернуться в магазин»,
// «Забыли пароль?» рядом с полем пароля и — на демо-сайте — плитка входа демо-админом («только просмотр»).
// Данные берутся с сайта (тот же домен): /api/game/catalog и /api/demo/config. Без них страница остаётся рабочей формой.
(function () {
  "use strict";

  var TEXTS = {
    en: {
      loginSub: "Sign in to get your keys, orders and cashback.",
      registerSub: "One account for your keys, orders and cashback.",
      back: "Back to store",
      demoHead: "Want to see the admin side? Sign in as the demo admin",
      admin: "Demo admin", adminMeta: "Whole admin panel, view-only",
      buyer: "Buyer", buyerMeta: "Shop & pay",
      divider: "or sign in with email",
      pitch: "Your next game is", pitchAccent: "one key away.",
      pitchText: "{n}+ PC games and software. Pay once, get the key by email in seconds.",
      pitchTextPlain: "PC games and software. Pay once, get the key by email in seconds.",
      perk1: "Instant delivery", perk1Text: "Key right after payment",
      perk2: "1% cashback", perk2Text: "On every order",
      perk3: "Secure checkout", perk3Text: "Payments by Stripe",
      totpAdd: "Add to authenticator app", totpAddHint: "Opens Google Authenticator, Passwords on iPhone or another app with the key filled in. Then come back and enter the 6-digit code."
    },
    ru: {
      loginSub: "Войдите, чтобы получить ключи, заказы и кэшбэк.",
      registerSub: "Один аккаунт — для ключей, заказов и кэшбэка.",
      back: "Вернуться в магазин",
      demoHead: "Хотите посмотреть админку? Войдите демо-администратором",
      admin: "Демо-администратор", adminMeta: "Вся админ-панель, только просмотр",
      buyer: "Покупатель", buyerMeta: "Покупки и оплата",
      divider: "или войдите по почте",
      pitch: "До новой игры —", pitchAccent: "всего один ключ.",
      pitchText: "{n}+ игр и программ для ПК. Оплатите — и ключ придёт на почту за секунды.",
      pitchTextPlain: "Игры и программы для ПК. Оплатите — и ключ придёт на почту за секунды.",
      perk1: "Мгновенная доставка", perk1Text: "Ключ сразу после оплаты",
      perk2: "Кэшбэк 1%", perk2Text: "С каждого заказа",
      perk3: "Безопасная оплата", perk3Text: "Платежи через Stripe",
      totpAdd: "Добавить в приложение-аутентификатор", totpAddHint: "Откроет Google Authenticator, «Пароли» на iPhone или другое приложение с уже подставленным ключом. Потом вернитесь сюда и введите 6-значный код."
    },
    uk: {
      loginSub: "Увійдіть, щоб отримати ключі, замовлення й кешбек.",
      registerSub: "Один акаунт — для ключів, замовлень і кешбеку.",
      back: "Повернутися до магазину",
      demoHead: "Хочете подивитися адмінку? Увійдіть демо-адміністратором",
      admin: "Демо-адміністратор", adminMeta: "Уся адмін-панель, лише перегляд",
      buyer: "Покупець", buyerMeta: "Покупки й оплата",
      divider: "або увійдіть поштою",
      pitch: "До нової гри —", pitchAccent: "лише один ключ.",
      pitchText: "{n}+ ігор і програм для ПК. Оплатіть — і ключ прийде на пошту за секунди.",
      pitchTextPlain: "Ігри й програми для ПК. Оплатіть — і ключ прийде на пошту за секунди.",
      perk1: "Миттєва доставка", perk1Text: "Ключ одразу після оплати",
      perk2: "Кешбек 1%", perk2Text: "З кожного замовлення",
      perk3: "Безпечна оплата", perk3Text: "Платежі через Stripe",
      totpAdd: "Додати в застосунок-автентифікатор", totpAddHint: "Відкриє Google Authenticator, «Паролі» на iPhone або інший застосунок із уже підставленим ключем. Потім поверніться сюди й введіть 6-значний код."
    },
    pl: {
      loginSub: "Zaloguj się, aby mieć dostęp do kluczy, zamówień i cashbacku.",
      registerSub: "Jedno konto na klucze, zamówienia i cashback.",
      back: "Wróć do sklepu",
      demoHead: "Chcesz zobaczyć panel administratora? Zaloguj się jako administrator demo",
      admin: "Administrator demo", adminMeta: "Cały panel, tylko podgląd",
      buyer: "Kupujący", buyerMeta: "Zakupy i płatność",
      divider: "lub zaloguj się e-mailem",
      pitch: "Twoja następna gra jest", pitchAccent: "o jeden klucz stąd.",
      pitchText: "Ponad {n} gier i programów na PC. Zapłać raz — klucz dotrze e-mailem w kilka sekund.",
      pitchTextPlain: "Gry i programy na PC. Zapłać raz — klucz dotrze e-mailem w kilka sekund.",
      perk1: "Natychmiastowa dostawa", perk1Text: "Klucz zaraz po płatności",
      perk2: "1% cashbacku", perk2Text: "Od każdego zamówienia",
      perk3: "Bezpieczna płatność", perk3Text: "Płatności przez Stripe",
      totpAdd: "Dodaj do aplikacji uwierzytelniającej", totpAddHint: "Otworzy Google Authenticator, Hasła na iPhonie lub inną aplikację z wpisanym kluczem. Potem wróć tutaj i wpisz 6-cyfrowy kod."
    }
  };

  var ICONS = {
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-3 1-3 2.2 0 2.8 6 1.4 6 4.3 0 1.2-1.3 2.2-3 2.2-1.2 0-2.3-.6-2.7-1.6M12 6v2M12 16v2"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
  };

  function language() {
    var tags = [document.documentElement.lang].concat(navigator.languages || [navigator.language]);
    for (var i = 0; i < tags.length; i++) {
      var code = String(tags[i] || "").slice(0, 2).toLowerCase();
      if (TEXTS[code]) return code;
    }
    return "en";
  }

  var T = TEXTS[language()];

  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function text(tag, className, value) {
    var node = el(tag, className);
    node.textContent = value;
    return node;
  }

  function getJson(url) {
    if (!window.fetch) return Promise.resolve(null);
    return fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .catch(function () { return null; });
  }

  // Обложка в рамке 16:9 шириной 480 — те же варианты, что у витрины сайта (/uploads/v/{w}/{рамка}/{путь}.webp).
  function coverUrl(path) {
    if (!path) return null;
    var match = /^\/uploads\/(.+)$/.exec(path);
    if (!match || /\.svg$/i.test(path)) return path;
    return "/uploads/v/480/16x9/" + match[1] + ".webp";
  }

  function image(src) {
    var img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.loading = "lazy";
    img.onload = function () { img.classList.add("is-loaded"); };
    img.onerror = function () { img.remove(); };
    img.src = src;
    return img;
  }

  /* --- Подзаголовок под заголовком страницы --- */
  function addSubtitle() {
    var title = document.getElementById("kc-page-title");
    if (!title) return;
    var sub = document.getElementById("kc-form-login") ? T.loginSub
      : document.getElementById("kc-register-form") ? T.registerSub : null;
    if (sub) title.insertAdjacentElement("afterend", text("p", "ts-sub", sub));
  }

  /* --- «Забыли пароль?» — в строку с подписью поля пароля, как принято --- */
  function moveForgotLink() {
    var link = document.querySelector('#kc-form-login a[href*="reset-credentials"]');
    var password = document.getElementById("password");
    var group = password && password.closest(".pf-v5-c-form__group");
    var label = group && group.querySelector(".pf-v5-c-form__group-label");
    if (!link || !label) return;
    link.classList.add("ts-forgot");
    label.appendChild(link);
  }

  /* --- Подвал: «Вернуться в магазин» --- */
  function addFooter(container) {
    var foot = el("div", "ts-foot");
    var back = el("a", null, icon("back"));
    back.href = "/";
    back.appendChild(document.createTextNode(T.back));
    foot.appendChild(back);
    foot.appendChild(text("span", null, "© " + new Date().getFullYear() + " Tale Shop"));
    container.appendChild(foot);
  }

  /* --- Витрина справа и лента обложек на телефоне --- */
  function addShowcase(login, container) {
    var aside = el("aside", "ts-showcase");
    aside.setAttribute("aria-hidden", "true");
    var wall = el("div", "ts-wall");
    aside.appendChild(wall);
    aside.appendChild(el("div", "ts-fade"));

    var pitch = el("div", "ts-pitch");
    var h2 = el("h2");
    h2.appendChild(document.createTextNode(T.pitch + " "));
    h2.appendChild(text("span", null, T.pitchAccent));
    pitch.appendChild(h2);
    var lead = text("p", null, T.pitchTextPlain);
    pitch.appendChild(lead);
    var perks = el("div", "ts-perks");
    [["bolt", T.perk1, T.perk1Text, ""], ["coin", T.perk2, T.perk2Text, " ts-perk--cash"], ["lock", T.perk3, T.perk3Text, ""]]
      .forEach(function (perk) {
        var card = el("div", "ts-perk" + perk[3], icon(perk[0]));
        card.appendChild(text("b", null, perk[1]));
        card.appendChild(document.createTextNode(perk[2]));
        perks.appendChild(card);
      });
    pitch.appendChild(perks);
    aside.appendChild(pitch);
    login.appendChild(aside);

    var strip = el("div", "ts-strip");
    strip.setAttribute("aria-hidden", "true");
    var header = document.getElementById("kc-header");
    if (header) header.insertAdjacentElement("afterend", strip);

    getJson("/api/game/catalog?kind=all&pageSize=24").then(function (page) {
      var items = page && Array.isArray(page.items) ? page.items : [];
      var covers = items.map(function (item) { return coverUrl(item.imagePath); }).filter(Boolean);
      if (page && page.total >= 20) {
        lead.textContent = T.pitchText.replace("{n}", String(Math.floor(page.total / 10) * 10));
      }
      // Стена справа грузится только на широком экране, лента — только на узком: лишние картинки не качаются.
      var wide = window.matchMedia("(min-width: 861px)").matches;
      covers.slice(0, wide ? 12 : 6).forEach(function (src) {
        (wide ? wall : strip).appendChild(image(src));
      });
    });
  }

  /* --- Демо-сайт: вход демо-аккаунтом в один клик --- */
  function setValue(input, value) {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function addDemoAccounts() {
    var form = document.getElementById("kc-form-login");
    if (!form || !document.getElementById("password")) return;
    getJson("/api/demo/config").then(function (config) {
      var accounts = config && config.enabled && Array.isArray(config.accounts) ? config.accounts : [];
      if (!accounts.length) return;

      var box = el("div", "ts-demo");
      var head = el("div", "ts-demo__head");
      head.appendChild(text("span", "ts-badge", "DEMO"));
      head.appendChild(document.createTextNode(T.demoHead));
      box.appendChild(head);

      var grid = el("div", "ts-demo__grid");
      accounts.forEach(function (account) {
        var admin = account.role === "admin";
        var tile = el("button", "ts-demo-tile");
        tile.type = "button";
        tile.appendChild(el("span", "ts-demo-tile__icon", icon(admin ? "shield" : "bag")));
        var label = el("span", "ts-demo-tile__text");
        label.appendChild(text("span", "ts-demo-tile__name", admin ? T.admin : T.buyer));
        label.appendChild(text("span", "ts-demo-tile__meta", admin ? T.adminMeta : T.buyerMeta));
        tile.appendChild(label);
        tile.appendChild(text("span", "ts-demo-tile__arrow", "→"));
        tile.addEventListener("click", function () {
          var username = document.getElementById("username");
          var password = document.getElementById("password");
          if (!username || !password) return;
          setValue(username, account.username);
          setValue(password, account.password);
          var submit = document.getElementById("kc-login");
          if (form.requestSubmit) form.requestSubmit(submit || undefined);
          else if (submit) submit.click();
          else form.submit();
        });
        grid.appendChild(tile);
      });
      box.appendChild(grid);
      box.appendChild(text("div", "ts-divider", T.divider));
      form.parentNode.insertBefore(box, form);
    });
  }

  // Языки — своим меню вместо системного <select>: раскрытый список браузер рисует сам, стилями его не оформить,
  // и выглядел он чужеродно. Названия — по-родному (Keycloak подписывает их на текущем языке: «английский (English)»).
  // Сам <select> остаётся в разметке скрытым — без скрипта страница работает как раньше.
  var NATIVE_LANGUAGES = { en: "English", pl: "Polski", ru: "Русский", uk: "Українська" };

  function localeOf(url) {
    var match = /[?&]kc_locale=([^&#]+)/.exec(url || "");
    return match ? decodeURIComponent(match[1]) : null;
  }

  function addLanguageMenu() {
    var select = document.getElementById("login-select-toggle");
    var holder = select && select.parentNode;
    if (!select || !holder || !select.options.length) return;
    var label = function (option) {
      var code = localeOf(option.value);
      return (code && NATIVE_LANGUAGES[code]) || option.text.trim();
    };
    var current = select.options[select.selectedIndex] || select.options[0];

    var wrap = el("div", "ts-lang");
    var toggle = el("button", "ts-lang__toggle", '<span></span>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>');
    toggle.type = "button";
    toggle.setAttribute("aria-haspopup", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", select.getAttribute("aria-label") || "Language");
    toggle.firstChild.textContent = label(current);

    var menu = el("ul", "ts-lang__menu");
    menu.hidden = true;
    Array.prototype.forEach.call(select.options, function (option) {
      var item = el("li");
      var link = el("a", "ts-lang__item" + (option.selected ? " is-current" : ""));
      link.href = option.value;
      link.lang = localeOf(option.value) || "";
      link.textContent = label(option);
      if (option.selected) {
        link.setAttribute("aria-current", "true");
        link.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>');
      }
      item.appendChild(link);
      menu.appendChild(item);
    });

    var setOpen = function (open) {
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
    };
    toggle.addEventListener("click", function () { setOpen(menu.hidden); });
    document.addEventListener("click", function (event) {
      if (!wrap.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !menu.hidden) {
        setOpen(false);
        toggle.focus();
      }
    });

    wrap.appendChild(toggle);
    wrap.appendChild(menu);
    holder.parentNode.insertBefore(wrap, holder);
    holder.style.display = "none";
  }

  // Настройка 2FA с телефона: QR-код на том же экране не отсканировать. Кнопка открывает приложение-аутентификатор
  // (Google Authenticator, «Пароли» iPhone…) ссылкой otpauth:// с уже подставленным ключом. Ключ — секрет из скрытого
  // поля формы в Base32, как его показывает сам Keycloak («Unable to scan?»). Параметры кода — стандартные (6 цифр,
  // 30 секунд, SHA1): своей политики OTP у realm нет. Шаблон Keycloak не переопределяем — только дополняем страницу.
  function base32(text) {
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    var bytes = new TextEncoder().encode(text);
    var out = "", bits = 0, value = 0;
    for (var i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) {
        out += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
    return out;
  }

  function addAuthenticatorLink() {
    var secret = document.getElementById("totpSecret");
    var anchor = document.getElementById("kc-totp-secret-qr-code") || document.getElementById("kc-totp-secret-key");
    if (!secret || !secret.value || !anchor || !window.TextEncoder) return;
    var label = "Tale Shop";
    var href = "otpauth://totp/" + encodeURIComponent(label) + "?secret=" + base32(secret.value) +
      "&issuer=" + encodeURIComponent(label) + "&algorithm=SHA1&digits=6&period=30";
    var box = el("div", "ts-totp-app");
    var link = el("a", "ts-totp-app__btn", icon("lock") + "<span></span>");
    link.href = href;
    link.lastChild.textContent = T.totpAdd;
    box.appendChild(link);
    box.appendChild(text("p", "ts-totp-app__hint", T.totpAddHint));
    var item = anchor.closest("li") || anchor.parentNode;
    item.appendChild(box);
  }

  function start() {
    var login = document.querySelector(".pf-v5-c-login");
    var container = document.querySelector(".pf-v5-c-login__container");
    if (!login || !container) return;
    addSubtitle();
    addLanguageMenu();
    addAuthenticatorLink();
    moveForgotLink();
    addFooter(container);
    addShowcase(login, container);
    addDemoAccounts();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
