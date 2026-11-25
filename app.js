/* ҰБТ: Оқу сауаттылығы — сайттың коды */
(function () {
  "use strict";
  var cfg = window.UBT_CONFIG || {};
  var sb = (cfg.supabaseUrl && cfg.supabaseKey && window.supabase) ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;
  var app = document.getElementById("app");
  var LETTERS = ["A", "B", "C", "D", "E"];

  var S = {
    view: "home", variants: [], loading: true, loadErr: false,
    teacher: false,
    // test
    v: null, name: "", klass: "", answers: [], cur: 0, textTab: 0, startedAt: 0, deadline: 0, confirm: false, timer: null,
    // result
    result: null, saveState: "",
    // teacher
    tTab: "results", results: [], resLoading: false, filterV: "", filterK: "", filterP: "all", week: [], weekLoading: true, edit: null, tMsg: "", tErr: false, loginMsg: "", confirmDel: null
  };

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtTime(sec) { sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m + ":" + String(s).padStart(2, "0"); }
  function fmtDate(iso) { var d = new Date(iso); if (isNaN(d)) return ""; return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function pct(a, b) { return b ? Math.round(a * 100 / b) : 0; }
  function level(p) { return p >= 80 ? "hi" : p >= 50 ? "mid" : "lo"; }
  function vById(id) { for (var i = 0; i < S.variants.length; i++) if (S.variants[i].id === id) return S.variants[i]; return null; }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  /* ---------- data ---------- */
  function loadVariants() {
    S.loading = true; S.loadErr = false;
    if (!sb) { S.loading = false; S.loadErr = true; render(); return Promise.resolve(); }
    return sb.from("ubt_variants").select("*").order("created_at", { ascending: true }).then(function (r) {
      S.loading = false;
      if (r.error) { console.error(r.error); S.loadErr = true; } else S.variants = r.data || [];
      render();
    });
  }

  function weekAgo() { return new Date(Date.now() - 7 * 864e5).toISOString(); }
  function loadWeek() {
    if (!sb) return;
    sb.from("ubt_results").select("student,klass,score,total,seconds,variant_id,created_at").gte("created_at", weekAgo()).order("created_at", { ascending: false }).limit(2000).then(function (r) {
      S.weekLoading = false; S.week = r.error ? [] : (r.data || []);
      if (S.view === "home") render();
    });
  }
  function ranking(rows) {
    var by = {};
    rows.forEach(function (r) {
      var k = r.student.trim().toLowerCase() + "|" + (r.klass || "").trim().toLowerCase();
      var p = pct(r.score, r.total), cur = by[k];
      if (!cur) by[k] = cur = { student: r.student, klass: r.klass, best: -1, score: 0, total: 0, seconds: null, n: 0, sum: 0 };
      cur.n++; cur.sum += p;
      if (p > cur.best || (p === cur.best && r.seconds != null && (cur.seconds == null || r.seconds < cur.seconds))) { cur.best = p; cur.score = r.score; cur.total = r.total; cur.seconds = r.seconds; }
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.best - a.best || (a.seconds == null ? 1e9 : a.seconds) - (b.seconds == null ? 1e9 : b.seconds) || b.n - a.n; });
  }
  function rankTable(list, limit) {
    if (!list.length) return '<div class="empty">Осы аптада әзірге ешкім тест тапсырған жоқ. Бірінші бол!</div>';
    return '<div class="tablewrap"><table><thead><tr><th>Орын</th><th>Оқушы</th><th>Сынып</th><th>Ең жақсы нәтиже</th><th>Уақыты</th><th>Тапсырды</th><th>Орташа</th></tr></thead><tbody>' +
      list.slice(0, limit || list.length).map(function (x, i) {
        return "<tr><td><b>" + (i < 3 ? ["🥇", "🥈", "🥉"][i] + " " : "") + (i + 1) + "</b></td><td>" + esc(x.student) + "</td><td>" + esc(x.klass || "") + '</td><td><span class="pill ' + level(x.best) + '">' + x.score + "/" + x.total + " · " + x.best + "%</span></td><td>" + (x.seconds != null ? fmtTime(x.seconds) : "") + "</td><td>" + x.n + " рет</td><td>" + Math.round(x.sum / x.n) + "%</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  /* ---------- views: home ---------- */
  function header() {
    return '<header class="band"><div class="wrap"><div><p class="eyebrow">ҰБТ-ға дайындық</p><h1>Оқу сауаттылығы</h1>' +
      '<p class="lede">Мәтінді мұқият оқы, ойлан, дұрыс жауапты тап. Пробный тестті тапсырып, қателеріңді түсіндірмесімен көр.</p></div>' +
      '<div class="facts"><div class="fact"><b>10</b><span>тапсырма</span></div><div class="fact"><b>1–3</b><span>мәтін</span></div><div class="fact"><b>⏱</b><span>уақытпен</span></div></div></div></header>';
  }
  function footer() {
    return '<footer><div class="wrap"><span>' + esc(cfg.school || "") + ' · ҰБТ: Оқу сауаттылығы</span>' +
      '<button data-act="teacher">' + (S.teacher ? "Мұғалім бөлімі" : "Мұғалім кіруі") + "</button></div></footer>";
  }
  function homeView() {
    var list = S.variants.filter(function (v) { return v.published; });
    var body;
    if (S.loading) body = '<div class="empty">Жүктелуде…</div>';
    else if (S.loadErr) body = '<div class="empty"><b>Нұсқалар жүктелмеді.</b><br>Интернетті тексеріп, бетті жаңартыңыз.</div>';
    else if (!list.length) body = '<div class="empty"><b>Әзірге нұсқа жоқ.</b><br>Мұғалім жаңа нұсқа қосқанда, ол осында пайда болады.</div>';
    else body = '<div class="grid">' + list.map(function (v) {
      var best = load("ubt-best-" + v.id);
      return '<article class="card"><h3>' + esc(v.title) + '</h3><div class="meta"><span>' + (v.questions || []).length + ' тапсырма</span><span>' + (v.texts || []).length + ' мәтін</span><span>' + v.minutes + ' минут</span></div>' +
        (best ? '<p class="muted" style="margin:0;font-size:14px">Сенің ең жақсы нәтижең: <b>' + best.score + "/" + best.total + "</b></p>" : "") +
        '<button class="btn" data-act="open" data-id="' + esc(v.id) + '">Тестті бастау</button></article>';
    }).join("") + "</div>";
    return header() + '<main><div class="wrap">' +
      '<div class="section-title"><h2>Пробный нұсқалар</h2><span class="muted">Бір нұсқаны бірнеше рет тапсыруға болады</span></div>' + body +
      '<div class="section-title" style="margin-top:12px"><h2>Апта рейтингі</h2><span class="muted">Соңғы 7 күн · ең жақсы нәтиже, тең болса — тезірек тапсырғаны жоғары</span></div>' +
      (S.weekLoading ? '<div class="empty">Жүктелуде…</div>' : rankTable(ranking(S.week), 15)) +
      '<div class="section-title" style="margin-top:12px"><h2>Қалай орындау керек</h2></div>' +
      '<div class="tips">' +
      '<div class="tip"><b>Алдымен сұрақты оқы</b><p>Сұрақтарды шолып шыққан соң, мәтінді не іздейтініңді біліп оқисың.</p></div>' +
      '<div class="tip"><b>Мәтіннен дәлел тап</b><p>Дұрыс жауап әрқашан мәтінде жазылған не одан қисынды шығады.</p></div>' +
      '<div class="tip"><b>«ЕМЕС» сөзіне назар</b><p>«Сәйкес келмейтін», «дұрыс емес» деген сұрақтарда жиі қателеседі.</p></div>' +
      '<div class="tip"><b>Уақытты бөл</b><p>Бір сұраққа тым көп тоқтама: белгілеп, кейін қайта орал.</p></div>' +
      "</div></div></main>" + footer();
  }

  /* ---------- views: start ---------- */
  function startView() {
    var v = S.v;
    var saved = load("ubt-run-" + v.id);
    return header() + '<main><div class="wrap"><form class="panel" data-form="start" style="max-width:640px">' +
      '<h2 style="font-size:26px">' + esc(v.title) + "</h2>" +
      '<div class="meta"><span>' + v.questions.length + ' тапсырма</span><span>' + v.texts.length + ' мәтін</span><span>' + v.minutes + ' минут</span></div>' +
      '<p class="muted" style="margin:0">Аты-жөніңді жаз. Тест басталған соң таймер қосылады. Уақыт біткенде тест өздігінен аяқталады.</p>' +
      '<div class="two"><label>Аты-жөні *<input type="text" id="s-name" required maxlength="80" value="' + esc(S.name) + '" placeholder="Мысалы: Айгерім Серікова"></label>' +
      '<label>Сыныбы<input type="text" id="s-klass" maxlength="20" value="' + esc(S.klass) + '" placeholder="Мысалы: 11 А"></label></div>' +
      (saved ? '<p class="msg ok">Бұл тестті бұрын бастағансың. «Жалғастыру» батырмасын бассаң, сол жерден жалғасады.</p>' : "") +
      '<div class="row"><button class="btn" type="submit">' + (saved ? "Жалғастыру" : "Тестті бастау") + "</button>" +
      (saved ? '<button class="btn ghost" type="button" data-act="restart">Басынан бастау</button>' : "") +
      '<button class="btn ghost" type="button" data-act="home">Артқа</button></div></form></div></main>' + footer();
  }

  /* ---------- views: test ---------- */
  function readingHtml() {
    var v = S.v, t = v.texts[S.textTab] || v.texts[0] || { title: "", body: "" };
    return '<aside class="reading" aria-label="Мәтін">' +
      (v.texts.length > 1 ? '<div class="tabs">' + v.texts.map(function (x, i) { return '<button data-act="tab" data-i="' + i + '" aria-pressed="' + (i === S.textTab) + '">' + (i + 1) + "-мәтін</button>"; }).join("") + "</div>" : "") +
      "<h3>" + esc(t.title) + '</h3><div class="txt">' + esc(t.body) + "</div></aside>";
  }
  function navHtml(review) {
    return '<div class="qnav">' + S.v.questions.map(function (q, i) {
      var cls = review ? (S.result.answers[i] === q.correct ? "right" : "wrong") : (i === S.cur ? "cur" : (S.answers[i] != null ? "done" : ""));
      if (review && i === S.cur) cls += " cur";
      return '<button data-act="goto" data-i="' + i + '" class="' + cls + '" aria-label="' + (i + 1) + '-сұрақ">' + (i + 1) + "</button>";
    }).join("") + "</div>";
  }
  function testView() {
    var v = S.v, q = v.questions[S.cur], n = v.questions.length;
    var answered = S.answers.filter(function (a) { return a != null; }).length;
    var left = Math.max(0, (S.deadline - Date.now()) / 1000);
    return '<div class="testbar"><div class="wrap"><span class="t">' + esc(v.title) + '</span><span class="muted" style="color:inherit;opacity:.8;font-size:15px" id="answered">' + answered + "/" + n + ' жауап</span><span class="timer' + (left < 120 ? " low" : "") + '" id="timer" aria-live="off">' + fmtTime(left) + "</span></div></div>" +
      '<main><div class="wrap">' + navHtml(false) +
      '<div class="split">' + readingHtml() +
      '<section class="qcard"><span class="qnum">' + (S.cur + 1) + "-тапсырма · " + ((q.text || 0) + 1) + "-мәтін бойынша</span>" +
      '<p class="qtext">' + esc(q.q) + "</p>" +
      '<div class="opts">' + q.options.map(function (o, i) {
        return '<button class="opt" data-act="pick" data-i="' + i + '" aria-pressed="' + (S.answers[S.cur] === i) + '"><span class="l">' + LETTERS[i] + "</span><span>" + esc(o) + "</span></button>";
      }).join("") + "</div>" +
      '<div class="row"><button class="btn ghost" data-act="prev" ' + (S.cur === 0 ? "disabled" : "") + '>← Алдыңғы</button>' +
      (S.cur < n - 1 ? '<button class="btn" data-act="next">Келесі →</button>' : "") +
      '<span style="flex:1"></span><button class="btn gold" data-act="finish">Тестті аяқтау</button></div>' +
      (S.confirm ? '<div class="confirm"><b>Тестті аяқтайсың ба?</b><span>' + (n - answered ? "Жауап берілмеген сұрақ: " + (n - answered) + ". Олар қате деп есептеледі." : "Барлық сұраққа жауап бердің.") + '</span><div class="row"><button class="btn" data-act="submit">Иә, аяқтау</button><button class="btn ghost" data-act="cancel">Жалғастыру</button></div></div>' : "") +
      "</section></div></div></main>";
  }

  /* ---------- views: result ---------- */
  function ring(p) {
    var r = 62, c = 2 * Math.PI * r, col = p >= 80 ? "var(--ok)" : p >= 50 ? "var(--gold)" : "var(--bad)";
    return '<svg class="ring" viewBox="0 0 150 150" role="img" aria-label="' + p + ' пайыз"><circle cx="75" cy="75" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="14"/>' +
      '<circle cx="75" cy="75" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + (c * p / 100) + " " + c + '" transform="rotate(-90 75 75)"/>' +
      '<text x="75" y="84" text-anchor="middle" font-size="30" font-weight="700" fill="var(--ink)" font-family="PT Sans, Arial, sans-serif">' + p + "%</text></svg>";
  }
  function resultView() {
    var R = S.result, v = S.v, p = pct(R.score, R.total);
    var note = p >= 80 ? "Керемет нәтиже! Осы деңгейді сақта." : p >= 50 ? "Жақсы! Қателеріңді талдап, тағы бір рет тапсырып көр." : "Мәтінді асықпай оқып, түсіндірмелерді қарап шық. Келесі жолы міндетті түрде жақсырақ болады.";
    var wrong = v.questions.map(function (q, i) { return R.answers[i] === q.correct ? null : i; }).filter(function (x) { return x != null; });
    return header() + '<main><div class="wrap">' +
      '<section class="panel"><div class="score">' + ring(p) + '<div style="display:grid;gap:6px"><span class="eyebrow" style="margin:0">' + esc(v.title) + "</span><h2>" + esc(R.student) + ": " + R.score + " / " + R.total + " балл</h2>" +
      '<span class="muted">Уақыты: ' + fmtTime(R.seconds) + " · Қате: " + wrong.length + "</span><p style=\"margin:0\">" + note + "</p>" +
      '<p class="msg ' + (S.saveState === "err" ? "err" : "ok") + '">' + (S.saveState === "saving" ? "Нәтиже мұғалімге жіберілуде…" : S.saveState === "ok" ? "Нәтиже мұғалімге жіберілді." : S.saveState === "err" ? "Нәтиже жіберілмеді. Интернетті тексеріңіз." : "") + "</p></div></div>" +
      '<div class="row"><button class="btn" data-act="again">Қайта тапсыру</button><button class="btn ghost" data-act="home">Рейтинг және басқа нұсқалар</button></div></section>' +
      '<div class="section-title"><h2>' + (wrong.length ? "Қателерді талдау" : "Барлық жауап дұрыс") + '</h2><span class="muted">Қызыл — сенің қате жауабың, жасыл — дұрыс жауап</span></div>' +
      '<div class="review">' + v.questions.map(function (q, i) {
        var a = R.answers[i], ok = a === q.correct;
        return '<article class="rv"><span class="tag ' + (ok ? "ok" : "bad") + '">' + (i + 1) + "-тапсырма · " + (ok ? "Дұрыс" : a == null ? "Жауап берілмеген" : "Қате") + "</span>" +
          '<p class="qtext" style="font-size:17px">' + esc(q.q) + "</p>" +
          '<div class="opts">' + q.options.map(function (o, j) {
            var cls = j === q.correct ? "right" : (j === a ? "wrong" : "");
            if (!cls && ok) return "";
            if (!cls) return "";
            return '<div class="opt ' + cls + '"><span class="l">' + LETTERS[j] + "</span><span>" + esc(o) + (j === a && j !== q.correct ? " <i>(сенің жауабың)</i>" : j === q.correct && !ok ? " <i>(дұрыс жауап)</i>" : "") + "</span></div>";
          }).join("") + "</div>" +
          (q.explain ? '<p class="explain"><b>Түсіндірме: </b>' + esc(q.explain) + "</p>" : "") + "</article>";
      }).join("") + "</div></div></main>" + footer();
  }

  /* ---------- views: teacher ---------- */
  function loginView() {
    return header() + '<main><div class="wrap"><form class="panel" data-form="login" style="max-width:520px"><h2 style="font-size:24px">Мұғалім кіруі</h2>' +
      '<p class="muted" style="margin:0">«Құлаққа кітап» сайтындағы мұғалімнің құпиясөзін енгізіңіз.</p>' +
      '<label>Құпиясөз<input type="password" id="l-pass" autocomplete="current-password" required></label>' +
      (S.loginMsg ? '<p class="msg err">' + esc(S.loginMsg) + "</p>" : "") +
      '<div class="row"><button class="btn" type="submit">Кіру</button><button class="btn ghost" type="button" data-act="home">Артқа</button></div></form></div></main>' + footer();
  }
  function teacherView() {
    var tabs = '<div class="tabsbar"><button data-act="ttab" data-t="results" aria-pressed="' + (S.tTab === "results") + '">Нәтижелер</button><button data-act="ttab" data-t="variants" aria-pressed="' + (S.tTab !== "results") + '">Нұсқалар</button><span style="flex:1"></span><button class="btn ghost small" data-act="logout">Шығу</button></div>';
    var body = S.tTab === "results" ? resultsTab() : S.edit ? editorView() : variantsTab();
    return header() + '<main><div class="wrap">' + tabs + (S.tMsg ? '<p class="msg ' + (S.tErr ? "err" : "ok") + '">' + esc(S.tMsg) + "</p>" : "") + body + "</div></main>" + footer();
  }
  function resultsTab() {
    if (S.resLoading) return '<div class="empty">Жүктелуде…</div>';
    var klasses = {}; S.results.forEach(function (r) { if (r.klass) klasses[r.klass] = 1; });
    var since = S.filterP === "week" ? weekAgo() : "";
    var rows = S.results.filter(function (r) { return (!S.filterV || r.variant_id === S.filterV) && (!S.filterK || r.klass === S.filterK) && (!since || r.created_at >= since); });
    var avgTime = rows.filter(function (r) { return r.seconds != null; }); avgTime = avgTime.length ? avgTime.reduce(function (s, r) { return s + r.seconds; }, 0) / avgTime.length : null;
    var avg = rows.length ? Math.round(rows.reduce(function (s, r) { return s + pct(r.score, r.total); }, 0) / rows.length) : 0;
    var students = {}; rows.forEach(function (r) { students[r.student.toLowerCase()] = 1; });
    return '<div class="row"><label style="min-width:220px">Нұсқа<select id="f-v"><option value="">Барлығы</option>' + S.variants.map(function (v) { return '<option value="' + esc(v.id) + '"' + (S.filterV === v.id ? " selected" : "") + ">" + esc(v.title) + "</option>"; }).join("") + "</select></label>" +
      '<label style="min-width:160px">Сынып<select id="f-k"><option value="">Барлығы</option>' + Object.keys(klasses).sort().map(function (k) { return '<option' + (S.filterK === k ? " selected" : "") + ">" + esc(k) + "</option>"; }).join("") + "</select></label>" +
      '<label style="min-width:160px">Кезең<select id="f-p"><option value="all"' + (S.filterP === "all" ? " selected" : "") + '>Барлық уақыт</option><option value="week"' + (S.filterP === "week" ? " selected" : "") + '>Соңғы 7 күн</option></select></label>' +
      '<span style="flex:1"></span><button class="btn ghost small" data-act="reloadres">Жаңарту</button></div>' +
      '<div class="stats"><div class="stat"><b>' + rows.length + '</b><span>тапсыру</span></div><div class="stat"><b>' + Object.keys(students).length + '</b><span>оқушы</span></div><div class="stat"><b>' + avg + '%</b><span>орташа нәтиже</span></div><div class="stat"><b>' + (avgTime != null ? fmtTime(avgTime) : "—") + '</b><span>орташа уақыт</span></div></div>' +
      summaryHtml(rows) +
      '<h3 style="font-size:20px">Рейтинг (' + (S.filterP === "week" ? "соңғы 7 күн" : "барлық уақыт") + ')</h3>' + rankTable(ranking(rows)) +
      pivotHtml(rows) +
      (rows.length ? groupsHtml(rows) : '<div class="empty">Әзірге нәтиже жоқ.</div>');
  }
  function attemptsTable(rows) {
    return '<div class="tablewrap"><table><thead><tr><th>Күні</th><th>Оқушы</th><th>Сынып</th><th>Нұсқа</th><th>Балл</th><th>Уақыты</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) {
          var v = vById(r.variant_id), p = pct(r.score, r.total), key = "r:" + r.id;
          return "<tr><td>" + esc(fmtDate(r.created_at)) + "</td><td>" + esc(r.student) + "</td><td>" + esc(r.klass || "") + "</td><td>" + esc(v ? v.title : "—") + '</td><td><span class="pill ' + level(p) + '">' + r.score + "/" + r.total + "</span></td><td>" + (r.seconds != null ? fmtTime(r.seconds) : "") + "</td><td>" + '<button class="btn small" data-act="detail" data-id="' + esc(r.id) + '">' + (S.detail === r.id ? "Жабу" : "Қателері") + "</button> " +
            (S.confirmDel === key ? '<button class="btn danger small" data-act="delres" data-id="' + esc(r.id) + '">Өшіру</button> <button class="btn ghost small" data-act="nodel">Жоқ</button>' : '<button class="btn ghost small" data-act="askdel" data-k="' + key + '">Өшіру</button>') + "</td></tr>" + (S.detail === r.id ? detailRow(r, v) : "");
        }).join("") + "</tbody></table></div>";
  }
  function groupsHtml(rows) {
    var ids = S.variants.map(function (v) { return v.id; }).filter(function (id) { return rows.some(function (r) { return r.variant_id === id; }); });
    rows.forEach(function (r) { if (ids.indexOf(r.variant_id) < 0) ids.push(r.variant_id); });
    return ids.map(function (id) {
      var rs = rows.filter(function (r) { return r.variant_id === id; }), v = vById(id);
      var avg = Math.round(rs.reduce(function (s, r) { return s + pct(r.score, r.total); }, 0) / rs.length);
      return '<h3 style="font-size:20px">' + esc(v ? v.title : "Өшірілген нұсқа") + ' <span class="muted" style="font-size:15px;font-family:var(--f-body);font-weight:400">· ' + rs.length + " тапсыру · орташа " + avg + "%</span></h3>" + attemptsTable(rs);
    }).join("");
  }
  function pivotHtml(rows) {
    if (!rows.length) return "";
    var vids = S.variants.map(function (v) { return v.id; }).filter(function (id) { return rows.some(function (r) { return r.variant_id === id; }); });
    var by = {}, keys = [];
    rows.forEach(function (r) {
      var k = r.student.trim().toLowerCase() + "|" + (r.klass || "").trim().toLowerCase();
      if (!by[k]) { by[k] = { student: r.student, klass: r.klass || "", cells: {} }; keys.push(k); }
      var c = by[k].cells[r.variant_id];
      if (!c) by[k].cells[r.variant_id] = { score: r.score, total: r.total, n: 1 };
      else { c.n++; if (r.score > c.score) { c.score = r.score; c.total = r.total; } }
    });
    keys.sort(function (a, b) { return by[a].klass.localeCompare(by[b].klass) || by[a].student.localeCompare(by[b].student); });
    return '<h3 style="font-size:20px">Оқушылар бойынша баллдар <span class="muted" style="font-size:15px;font-family:var(--f-body);font-weight:400">· әр тесттің ең жақсы нәтижесі</span></h3>' +
      '<div class="tablewrap"><table><thead><tr><th>Оқушы</th><th>Сынып</th>' + vids.map(function (id) { return '<th style="white-space:normal;min-width:110px">' + esc(vById(id).title) + "</th>"; }).join("") + "<th>Барлығы</th></tr></thead><tbody>" +
      keys.map(function (k) {
        var x = by[k], sum = 0, tot = 0;
        return "<tr><td>" + esc(x.student) + "</td><td>" + esc(x.klass) + "</td>" + vids.map(function (id) {
          var c = x.cells[id]; if (!c) return '<td class="muted">—</td>';
          sum += c.score; tot += c.total;
          return '<td><span class="pill ' + level(pct(c.score, c.total)) + '">' + c.score + "/" + c.total + "</span>" + (c.n > 1 ? ' <span class="muted" style="font-size:13px">(' + c.n + " рет)</span>" : "") + "</td>";
        }).join("") + "<td><b>" + sum + "/" + tot + "</b></td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function detailRow(r, v) {
    if (!v) return '<tr><td colspan="7">Нұсқа табылмады.</td></tr>';
    var a = r.answers || [], nWrong = 0;
    var items = v.questions.map(function (q, i) {
      var x = a[i], ok = x === q.correct;
      if (ok) return '<li style="color:var(--ok)"><b>' + (i + 1) + ".</b> ✓ Дұрыс (" + LETTERS[q.correct] + ")</li>";
      nWrong++;
      return '<li style="color:var(--bad)"><b>' + (i + 1) + ".</b> ✗ " + (x == null ? "Жауап бермеген" : "Таңдағаны: " + LETTERS[x] + " – " + esc(q.options[x] || "")) +
        ' <span style="color:var(--ok)">· Дұрысы: ' + LETTERS[q.correct] + " – " + esc(q.options[q.correct]) + '</span><br><span class="muted" style="font-size:14px">' + esc(q.q) + "</span></li>";
    }).join("");
    return '<tr><td colspan="7" style="white-space:normal;background:var(--bg)"><b>' + esc(r.student) + ": " + nWrong + ' қате</b><ol style="list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px">' + items + "</ol></td></tr>";
  }
  function summaryHtml(rows) {
    if (!S.filterV) return '<p class="muted" style="margin:0">Тапсырмалар бойынша жиынтықты көру үшін жоғарыдан нұсқаны таңдаңыз.</p>';
    var v = vById(S.filterV); if (!v || !rows.length) return "";
    var stats = v.questions.map(function (q, i) {
      var right = 0, wrongBy = {}, blank = 0;
      rows.forEach(function (r) { var a = r.answers ? r.answers[i] : null; if (a === q.correct) right++; else if (a == null) blank++; else wrongBy[a] = (wrongBy[a] || 0) + 1; });
      var top = Object.keys(wrongBy).sort(function (a, b) { return wrongBy[b] - wrongBy[a]; })[0];
      return { i: i, p: pct(right, rows.length), top: top != null ? LETTERS[top] + " (" + wrongBy[top] + " оқушы)" : "—", blank: blank };
    });
    return '<h3 style="font-size:20px">Тапсырмалар бойынша жиынтық</h3><div class="tablewrap"><table><thead><tr><th>№</th><th>Сұрақ</th><th>Дұрыс жауап берді</th><th>Жиі таңдалған қате</th><th>Жауап бермеді</th></tr></thead><tbody>' +
      stats.map(function (x) {
        var q = v.questions[x.i];
        return "<tr><td>" + (x.i + 1) + '</td><td style="white-space:normal;min-width:260px">' + esc(q.q) + '</td><td><span class="pill ' + level(x.p) + '">' + x.p + "%</span></td><td>" + x.top + "</td><td>" + x.blank + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function variantsTab() {
    return '<div class="row"><button class="btn" data-act="newv">+ Жаңа нұсқа</button></div>' +
      (S.variants.length ? '<div class="grid">' + S.variants.map(function (v) {
        var key = "v:" + v.id;
        return '<article class="card"><h3>' + esc(v.title) + '</h3><div class="meta"><span>' + v.questions.length + ' тапсырма</span><span>' + v.texts.length + ' мәтін</span><span>' + v.minutes + ' мин</span><span>' + (v.published ? "Оқушыларға көрінеді" : "Жасырын") + "</span></div>" +
          '<div class="row"><button class="btn small" data-act="editv" data-id="' + esc(v.id) + '">Өңдеу</button>' +
          (S.confirmDel === key ? '<button class="btn danger small" data-act="delv" data-id="' + esc(v.id) + '">Иә, өшіру</button><button class="btn ghost small" data-act="nodel">Жоқ</button>' : '<button class="btn ghost small" data-act="askdel" data-k="' + key + '">Өшіру</button>') + "</div></article>";
      }).join("") + "</div>" : '<div class="empty">Нұсқа жоқ. «+ Жаңа нұсқа» батырмасын басыңыз.</div>');
  }
  function editorView() {
    var e = S.edit;
    return '<form class="panel" data-form="variant"><h2 style="font-size:24px">' + (e.id ? "Нұсқаны өңдеу" : "Жаңа нұсқа") + "</h2>" +
      '<div class="two"><label>Атауы *<input type="text" id="e-title" maxlength="120" value="' + esc(e.title) + '" placeholder="Мысалы: Пробный тест №2"></label>' +
      '<label>Уақыты (минут)<input type="number" id="e-min" min="1" max="240" value="' + esc(e.minutes) + '"></label></div>' +
      '<label class="row" style="color:var(--ink);font-size:16px"><input type="checkbox" id="e-pub"' + (e.published ? " checked" : "") + '> Оқушыларға көрінеді</label>' +
      "<h3>Мәтіндер</h3>" +
      e.texts.map(function (t, i) {
        return '<div class="qedit"><div class="row"><b>' + (i + 1) + '-мәтін</b><span style="flex:1"></span>' + (e.texts.length > 1 ? '<button type="button" class="btn ghost small" data-act="rmtext" data-i="' + i + '">Алып тастау</button>' : "") + "</div>" +
          '<label>Атауы<input type="text" class="t-title" value="' + esc(t.title) + '"></label>' +
          '<label>Мәтін *<textarea class="t-body" rows="8">' + esc(t.body) + "</textarea></label></div>";
      }).join("") +
      '<div class="row"><button type="button" class="btn ghost small" data-act="addtext">+ Мәтін қосу</button></div>' +
      "<h3>Тапсырмалар (" + e.questions.length + ")</h3>" +
      e.questions.map(function (q, i) {
        return '<div class="qedit"><div class="row"><b>' + (i + 1) + '-тапсырма</b><span style="flex:1"></span><button type="button" class="btn ghost small" data-act="rmq" data-i="' + i + '">Алып тастау</button></div>' +
          '<label>Қай мәтін бойынша<select class="q-text">' + e.texts.map(function (t, j) { return '<option value="' + j + '"' + (q.text === j ? " selected" : "") + ">" + (j + 1) + "-мәтін</option>"; }).join("") + "</select></label>" +
          '<label>Сұрақ *<textarea class="q-q" rows="2">' + esc(q.q) + "</textarea></label>" +
          '<span class="muted" style="font-size:14px">Жауап нұсқалары (дұрысын белгілеңіз)</span>' +
          [0, 1, 2, 3, 4].map(function (j) {
            return '<div class="optrow"><input type="radio" name="c' + i + '" value="' + j + '"' + (q.correct === j ? " checked" : "") + ' aria-label="' + LETTERS[j] + ' дұрыс"><input type="text" class="q-o" data-j="' + j + '" value="' + esc(q.options[j] || "") + '" placeholder="' + LETTERS[j] + (j > 3 ? " (міндетті емес)" : "") + '"></div>';
          }).join("") +
          '<label>Түсіндірме (қате жауаптан кейін көрінеді)<textarea class="q-ex" rows="2">' + esc(q.explain || "") + "</textarea></label></div>";
      }).join("") +
      '<div class="row"><button type="button" class="btn ghost small" data-act="addq">+ Тапсырма қосу</button></div>' +
      '<div class="row"><button class="btn" type="submit">Сақтау</button><button class="btn ghost" type="button" data-act="canceledit">Болдырмау</button></div></form>';
  }

  /* ---------- render ---------- */
  function render() {
    var html;
    if (S.view === "start") html = startView();
    else if (S.view === "test") html = testView();
    else if (S.view === "result") html = resultView();
    else if (S.view === "teacher") html = S.teacher ? teacherView() : loginView();
    else html = homeView();
    app.innerHTML = html;
  }

  /* ---------- test logic ---------- */
  function runKey() { return "ubt-run-" + S.v.id; }
  function persistRun() { store(runKey(), { answers: S.answers, cur: S.cur, deadline: S.deadline, startedAt: S.startedAt, name: S.name, klass: S.klass }); }
  function startTest(resume) {
    var v = S.v, saved = resume ? load(runKey()) : null;
    if (saved && saved.deadline > Date.now()) {
      S.answers = saved.answers; S.cur = saved.cur || 0; S.deadline = saved.deadline; S.startedAt = saved.startedAt;
    } else {
      S.answers = v.questions.map(function () { return null; }); S.cur = 0; S.startedAt = Date.now(); S.deadline = Date.now() + v.minutes * 60000;
    }
    S.textTab = v.questions[S.cur] ? (v.questions[S.cur].text || 0) : 0; S.confirm = false; S.view = "test";
    persistRun(); render(); window.scrollTo(0, 0); tick();
    clearInterval(S.timer); S.timer = setInterval(tick, 1000);
  }
  function tick() {
    if (S.view !== "test") { clearInterval(S.timer); return; }
    var left = (S.deadline - Date.now()) / 1000, el = document.getElementById("timer");
    if (el) { el.textContent = fmtTime(left); el.className = "timer" + (left < 120 ? " low" : ""); }
    if (left <= 0) submit(true);
  }
  function setQ(i) {
    S.cur = Math.max(0, Math.min(S.v.questions.length - 1, i));
    var t = S.v.questions[S.cur].text || 0; S.textTab = t; S.confirm = false;
    persistRun(); render();
  }
  function submit(auto) {
    clearInterval(S.timer);
    var v = S.v, score = 0;
    v.questions.forEach(function (q, i) { if (S.answers[i] === q.correct) score++; });
    var seconds = Math.min(v.minutes * 60, Math.round((Date.now() - S.startedAt) / 1000));
    S.result = { student: S.name, klass: S.klass, score: score, total: v.questions.length, seconds: seconds, answers: S.answers.slice(), auto: !!auto };
    store(runKey(), null);
    var best = load("ubt-best-" + v.id);
    if (!best || score > best.score) store("ubt-best-" + v.id, { score: score, total: v.questions.length });
    S.view = "result"; S.saveState = "saving"; S.cur = 0; render(); window.scrollTo(0, 0);
    if (!sb) { S.saveState = "err"; render(); return; }
    sb.from("ubt_results").insert({ variant_id: v.id, student: S.name, klass: S.klass || null, score: score, total: v.questions.length, seconds: seconds, answers: S.answers }).then(function (r) {
      S.saveState = r.error ? "err" : "ok"; if (r.error) console.error(r.error); else loadWeek();
      if (S.view === "result") render();
    });
  }

  /* ---------- teacher logic ---------- */
  function isTeacherSession(session) { return !!(session && session.user && session.user.email === cfg.teacherEmail); }
  function loadResults() {
    S.resLoading = true; render();
    sb.from("ubt_results").select("*").order("created_at", { ascending: false }).limit(1000).then(function (r) {
      S.resLoading = false;
      if (r.error) { S.tMsg = "Нәтижелер жүктелмеді."; S.tErr = true; } else S.results = r.data || [];
      render();
    });
  }
  function blankQ() { return { text: 0, q: "", options: ["", "", "", ""], correct: null, explain: "" }; }
  function collectEditor() {
    var e = S.edit; if (!e) return;
    var g = function (id) { var el = document.getElementById(id); return el ? el : null; };
    if (g("e-title")) e.title = g("e-title").value.trim();
    if (g("e-min")) e.minutes = parseInt(g("e-min").value, 10) || 20;
    if (g("e-pub")) e.published = g("e-pub").checked;
    var tt = app.querySelectorAll(".t-title"), tb = app.querySelectorAll(".t-body");
    e.texts = Array.prototype.map.call(tb, function (b, i) { return { title: tt[i].value.trim(), body: b.value.replace(/\s+$/, "") }; });
    var blocks = app.querySelectorAll(".qedit .q-q");
    e.questions = Array.prototype.map.call(blocks, function (qq, i) {
      var box = qq.closest(".qedit");
      var opts = Array.prototype.map.call(box.querySelectorAll(".q-o"), function (o) { return o.value.trim(); });
      var c = box.querySelector('input[type=radio]:checked');
      return { text: parseInt(box.querySelector(".q-text").value, 10) || 0, q: qq.value.trim(), options: opts, correct: c ? parseInt(c.value, 10) : null, explain: box.querySelector(".q-ex").value.trim() };
    });
  }
  function saveVariant() {
    collectEditor();
    var e = S.edit, err = "";
    if (!e.title) err = "Нұсқаның атауын жазыңыз.";
    else if (!e.texts.length || e.texts.some(function (t) { return !t.body.trim(); })) err = "Әр мәтіннің мазмұнын толтырыңыз.";
    else if (!e.questions.length) err = "Кемінде бір тапсырма қосыңыз.";
    else {
      for (var i = 0; i < e.questions.length; i++) {
        var q = e.questions[i], filled = q.options.filter(function (o) { return o; }).length;
        if (!q.q) { err = (i + 1) + "-тапсырманың сұрағын жазыңыз."; break; }
        if (filled < 2) { err = (i + 1) + "-тапсырмаға кемінде екі жауап нұсқасын жазыңыз."; break; }
        if (q.correct == null || !q.options[q.correct]) { err = (i + 1) + "-тапсырманың дұрыс жауабын белгілеңіз."; break; }
      }
    }
    if (err) { S.tMsg = err; S.tErr = true; render(); window.scrollTo(0, 0); return; }
    // compact options: drop empty ones, remap correct
    var questions = e.questions.map(function (q) {
      var opts = [], corr = 0;
      q.options.forEach(function (o, j) { if (o) { if (j === q.correct) corr = opts.length; opts.push(o); } });
      return { text: Math.min(q.text, e.texts.length - 1), q: q.q, options: opts, correct: corr, explain: q.explain };
    });
    var row = { title: e.title, minutes: Math.max(1, Math.min(240, e.minutes)), published: e.published, texts: e.texts, questions: questions };
    S.tMsg = "Сақталуда…"; S.tErr = false; render();
    var p = e.id ? sb.from("ubt_variants").update(row).eq("id", e.id).select().single() : sb.from("ubt_variants").insert(row).select().single();
    p.then(function (r) {
      if (r.error) { console.error(r.error); S.tMsg = "Сақталмады. Қайта кіріп көріңіз."; S.tErr = true; render(); return; }
      S.edit = null; S.tMsg = "Нұсқа сақталды."; S.tErr = false;
      if (questions.length !== 10) S.tMsg += " Ескерту: ҰБТ-да оқу сауаттылығынан 10 тапсырма беріледі, бұл нұсқада " + questions.length + ".";
      loadVariants();
    });
  }

  /* ---------- routing ---------- */
  function route() {
    var h = (location.hash || "").replace("#", "");
    clearInterval(S.timer);
    if (h === "mugalim") { S.view = "teacher"; if (S.teacher && !S.results.length) loadResults(); render(); return; }
    var m = /^v-([0-9a-f-]{36})$/.exec(h);
    if (m) {
      var v = vById(m[1]);
      if (v) { S.v = v; S.view = "start"; render(); return; }
      if (S.loading) { S.pending = m[1]; return; }
    }
    S.view = "home"; render();
  }

  /* ---------- events ---------- */
  app.addEventListener("submit", function (ev) {
    var f = ev.target.getAttribute("data-form"); if (!f) return; ev.preventDefault();
    if (f === "start") {
      S.name = document.getElementById("s-name").value.trim(); S.klass = document.getElementById("s-klass").value.trim();
      if (!S.name) return;
      store("ubt-me", { name: S.name, klass: S.klass });
      startTest(true);
    } else if (f === "login") {
      var pass = document.getElementById("l-pass").value;
      sb.auth.signInWithPassword({ email: cfg.teacherEmail, password: pass }).then(function (r) {
        if (r.error) { S.loginMsg = "Құпиясөз дұрыс емес."; render(); return; }
        S.teacher = true; S.loginMsg = ""; loadResults(); loadVariants();
      });
    } else if (f === "variant") saveVariant();
  });
  app.addEventListener("change", function (ev) {
    if (ev.target.id === "f-v") { S.filterV = ev.target.value; render(); }
    if (ev.target.id === "f-k") { S.filterK = ev.target.value; render(); }
    if (ev.target.id === "f-p") { S.filterP = ev.target.value; render(); }
  });
  app.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-act]"); if (!b) return;
    var a = b.getAttribute("data-act"), i = parseInt(b.getAttribute("data-i"), 10);
    switch (a) {
      case "open": go("#v-" + b.getAttribute("data-id")); break;
      case "home": go("#"); break;
      case "teacher": go("#mugalim"); break;
      case "restart": store(runKey(), null); render(); break;
      case "tab": S.textTab = i; render(); break;
      case "pick":
        S.answers[S.cur] = i; persistRun(); render(); break;
      case "goto":
        if (S.view === "result") { var el = app.querySelectorAll(".rv")[i]; if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
        else setQ(i);
        break;
      case "prev": setQ(S.cur - 1); break;
      case "next": setQ(S.cur + 1); break;
      case "finish": S.confirm = true; render(); break;
      case "cancel": S.confirm = false; render(); break;
      case "submit": submit(false); break;
      case "again": S.view = "start"; render(); break;
      case "ttab": S.tTab = b.getAttribute("data-t"); S.tMsg = ""; S.confirmDel = null; if (S.tTab === "results") loadResults(); else render(); break;
      case "reloadres": loadResults(); break;
      case "logout": sb.auth.signOut().then(function () { S.teacher = false; S.edit = null; go("#"); }); break;
      case "detail": S.detail = S.detail === b.getAttribute("data-id") ? null : b.getAttribute("data-id"); render(); break;
      case "askdel": S.confirmDel = b.getAttribute("data-k"); render(); break;
      case "nodel": S.confirmDel = null; render(); break;
      case "delres":
        sb.from("ubt_results").delete().eq("id", b.getAttribute("data-id")).then(function (r) {
          if (!r.error) S.results = S.results.filter(function (x) { return x.id !== b.getAttribute("data-id"); });
          S.confirmDel = null; render();
        }); break;
      case "delv":
        sb.from("ubt_variants").delete().eq("id", b.getAttribute("data-id")).then(function (r) {
          S.confirmDel = null; S.tMsg = r.error ? "Өшірілмеді." : "Нұсқа өшірілді."; S.tErr = !!r.error; loadVariants();
        }); break;
      case "newv": S.edit = { id: null, title: "", minutes: 20, published: true, texts: [{ title: "", body: "" }], questions: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(blankQ) }; S.tMsg = ""; render(); break;
      case "editv":
        var v = vById(b.getAttribute("data-id"));
        S.edit = JSON.parse(JSON.stringify({ id: v.id, title: v.title, minutes: v.minutes, published: v.published, texts: v.texts, questions: v.questions }));
        S.edit.questions.forEach(function (q) { while (q.options.length < 4) q.options.push(""); });
        S.tMsg = ""; render(); window.scrollTo(0, 0); break;
      case "canceledit": S.edit = null; S.tMsg = ""; render(); break;
      case "addtext": collectEditor(); S.edit.texts.push({ title: "", body: "" }); render(); break;
      case "rmtext": collectEditor(); S.edit.texts.splice(i, 1); S.edit.questions.forEach(function (q) { if (q.text >= S.edit.texts.length) q.text = 0; }); render(); break;
      case "addq": collectEditor(); S.edit.questions.push(blankQ()); render(); break;
      case "rmq": collectEditor(); S.edit.questions.splice(i, 1); render(); break;
    }
  });
  window.addEventListener("hashchange", route);

  /* ---------- start ---------- */
  var me = load("ubt-me"); if (me) { S.name = me.name || ""; S.klass = me.klass || ""; }
  render();
  if (sb) sb.auth.getSession().then(function (r) { S.teacher = isTeacherSession(r.data && r.data.session); if (S.view === "teacher") { if (S.teacher) loadResults(); else render(); } });
  loadWeek();
  loadVariants().then(function () {
    if (S.pending) { var v = vById(S.pending); S.pending = null; if (v) { S.v = v; S.view = "start"; render(); return; } }
    route();
  });
})();
