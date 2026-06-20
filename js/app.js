/* =====================================================================
   OLIVA GOURMET — app.js
   Renderiza o cardápio (window.MENU) e cuida das interações.
   ===================================================================== */
(function () {
  "use strict";
  var MENU = window.MENU || { store: {}, highlights: [], categories: [] };

  /* ---------- helpers ---------- */
  function el(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function brl(n) { return "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  // fallback de imagem -> placeholder elegante com a azeitona
  window.oliva_imgFail = function (img) {
    var box = img.parentNode; if (!box) return;
    img.remove();
    box.insertAdjacentHTML("beforeend", '<div class="dish-ph"><svg aria-hidden="true"><use href="#olive"/></svg></div>');
  };
  function imgTag(src, alt, cls) {
    if (!src) return '<div class="dish-ph"><svg aria-hidden="true"><use href="#olive"/></svg></div>';
    return '<img class="' + (cls || "") + '" src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy" onerror="oliva_imgFail(this)" />';
  }

  function weightChip(w) { return w ? '<span class="dish-tag">' + esc(w) + "</span>" : ""; }

  /* ---------- preço (formas diferentes de item) ---------- */
  function galleryPrice(it) {
    if (it.priceLunch || it.priceDinner) {
      return '<div class="price-pair">' +
        (it.priceLunch ? '<div><div class="price">' + brl(it.priceLunch) + '</div><div class="price-sub">Almoço</div></div>' : "") +
        (it.priceDinner ? '<div><div class="price">' + brl(it.priceDinner) + '</div><div class="price-sub">Jantar</div></div>' : "") +
        "</div>";
    }
    if (it.price) return '<span class="price">' + brl(it.price) + "</span>";
    return '<span class="price-consult">Sob consulta</span>';
  }

  /* ---------- card (modo galeria) ---------- */
  function dishCard(it) {
    var media = '<div class="dish-media">' + weightChip(it.weight) + imgTag(it.image, it.name) + "</div>";
    var desc = it.desc ? '<p class="dish-desc">' + esc(it.desc) + "</p>" : '<p class="dish-desc"></p>';
    return el(
      '<article class="dish">' + media +
        '<div class="dish-body">' +
          '<h4 class="dish-name">' + esc(it.name) + "</h4>" + desc +
          '<div class="dish-foot">' + galleryPrice(it) + "</div>" +
        "</div>" +
      "</article>"
    );
  }

  /* ---------- row (modo lista) ---------- */
  function rowPrice(it) {
    if (it.priceM || it.priceG) {
      return '<div class="row-prices">' +
        (it.priceM ? "<span><small>M</small><b>" + brl(it.priceM) + "</b></span>" : "") +
        (it.priceG ? "<span><small>G</small><b>" + brl(it.priceG) + "</b></span>" : "") +
        "</div>";
    }
    if (it.price) return '<span class="row-price">' + brl(it.price) + "</span>";
    return '<span class="price-consult">Sob consulta</span>';
  }
  function dishRow(it) {
    var desc = it.desc ? '<p class="row-desc">' + esc(it.desc) + "</p>" : "";
    return el(
      '<div class="row">' +
        '<div class="row-main">' +
          '<div class="row-top"><span class="row-name">' + esc(it.name) + (it.weight ? " · " + esc(it.weight) : "") + "</span><span class=\"row-lead\"></span></div>" +
          desc +
        "</div>" + rowPrice(it) +
      "</div>"
    );
  }

  /* ---------- render do cardápio ---------- */
  var sectionsHost = document.getElementById("menuSections");
  var catNav = document.getElementById("catNav");

  function renderMenu() {
    MENU.categories.forEach(function (cat) {
      if (!cat.items || !cat.items.length) return;
      var sec = el('<section class="menu-cat reveal" id="cat-' + cat.slug + '" data-name="' + esc(norm(cat.name)) + '"></section>');
      sec.appendChild(el(
        '<div class="menu-cat-head"><h3>' + esc(cat.name) + '</h3><span class="rule"></span><span class="count">' + cat.items.length + " itens</span></div>"
      ));
      var wrap = el('<div class="' + (cat.layout === "list" ? "dish-list" : "dish-grid") + '"></div>');
      cat.items.forEach(function (it) {
        var node = cat.layout === "list" ? dishRow(it) : dishCard(it);
        node.dataset.search = norm(it.name + " " + (it.desc || ""));
        wrap.appendChild(node);
      });
      sec.appendChild(wrap);
      sectionsHost.appendChild(sec);

      var chip = el('<a class="cat-chip" href="#cat-' + cat.slug + '" data-slug="' + cat.slug + '">' + esc(cat.name) + "</a>");
      catNav.appendChild(chip);
    });
  }

  /* ---------- highlights ---------- */
  function renderHighlights() {
    var host = document.getElementById("highlightGrid");
    if (!host) return;
    (MENU.highlights || []).forEach(function (it) {
      host.appendChild(el(
        '<article class="h-card reveal">' + imgTag(it.image, it.name) +
          '<div class="h-card-body">' +
            '<span class="h-card-cat">' + esc(it.category || "") + "</span>" +
            '<h3 class="h-card-name">' + esc(it.name) + "</h3>" +
            '<span class="h-card-price">' + (it.price ? brl(it.price) : "") + "</span>" +
          "</div>" +
        "</article>"
      ));
    });
  }

  /* ---------- busca ---------- */
  function setupSearch() {
    var input = document.getElementById("menuSearch");
    var empty = document.getElementById("menuEmpty");
    if (!input) return;
    var t;
    input.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var q = norm(input.value.trim());
        var anyVisible = false;
        document.querySelectorAll(".menu-cat").forEach(function (sec) {
          var items = sec.querySelectorAll("[data-search]");
          var shown = 0;
          items.forEach(function (it) {
            var match = !q || it.dataset.search.indexOf(q) !== -1;
            it.style.display = match ? "" : "none";
            if (match) shown++;
          });
          sec.style.display = shown ? "" : "none";
          var chip = catNav.querySelector('[data-slug="' + sec.id.replace("cat-", "") + '"]');
          if (chip) chip.style.display = shown ? "" : "none";
          if (shown) anyVisible = true;
        });
        empty.hidden = anyVisible;
      }, 120);
    });
  }

  /* ---------- scrollspy nas categorias ---------- */
  function setupScrollspy() {
    var chips = catNav.querySelectorAll(".cat-chip");
    var sections = [].slice.call(document.querySelectorAll(".menu-cat"));
    if (!sections.length) return;
    function setActive(slug) {
      chips.forEach(function (c) { c.classList.toggle("active", c.dataset.slug === slug); });
      var active = catNav.querySelector(".cat-chip.active");
      if (active && active.scrollIntoView) active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id.replace("cat-", "")); });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* ---------- reveal on scroll ---------- */
  function setupReveal() {
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ---------- header / nav / to-top ---------- */
  function setupChrome() {
    var header = document.getElementById("header");
    var toTop = document.getElementById("toTop");
    function onScroll() {
      var y = window.scrollY;
      header.classList.toggle("scrolled", y > 40);
      toTop.classList.toggle("show", y > 600);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

    var toggle = document.getElementById("navToggle");
    var nav = document.getElementById("nav");
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open);
      toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { nav.classList.remove("open"); toggle.classList.remove("open"); toggle.setAttribute("aria-expanded", false); });
    });
  }

  /* ---------- info da loja (telefone, pagamentos, ano) ---------- */
  function setupStore() {
    var s = MENU.store || {};
    var tel = s.phoneRaw ? "tel:+55" + s.phoneRaw : "#";
    ["navCall", "heroCall"].forEach(function (id) { var n = document.getElementById(id); if (n) n.href = tel; });
    ["stripPhone", "footPhone"].forEach(function (id) { var n = document.getElementById(id); if (n) { n.href = tel; n.insertAdjacentText("beforeend", s.phone || "—"); } });
    var pay = document.getElementById("stripPay");
    if (pay) pay.textContent = (s.payments || []).join(" · ") || "—";
    var yr = document.getElementById("year"); if (yr) yr.textContent = new Date().getFullYear();
  }

  /* ---------- init ---------- */
  renderMenu();
  setupSearch();
  setupScrollspy();
  setupReveal();
  setupChrome();
  setupStore();
})();
