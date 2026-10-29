#!/usr/bin/env python3
"""Генератор блога (/blog/), Тати 2026-10-28; с 2026-10-29 это блог, а не «база знаний»:
кроме справочных статей будут новости. Старые адреса /guides/... ведут сюда (301 в nginx).

Запись пишется одним файлом _blog/articles/<slug>.html: сверху JSON-шапка в
комментарии <!--META ... -->, ниже — текст (HTML). Рубрика — поле "topic" (см. _blog/topics.py);
у рубрики "news" поля summary/faq/sources необязательны, в разметке — NewsArticle.
Генератор собирает:
  /blog/index.html          — лента записей, новые сверху, фильтр по рубрикам;
  /blog/<slug>/index.html   — страница записи;
  sitemap.xml                 — блок адресов раздела между маркерами;
  assets/search-index.json    — записи раздела для поиска по сайту.

Шапка и подвал берутся с живой страницы /trust/ — меню, счётчики и скрипты
у раздела всегда такие же, как на остальном сайте.

Черновики (\"draft\": true) не собираются. Посмотреть их локально:
  python3 _blog_gen.py --drafts
⚠️ Папку _blog/ и этот файл на сервер не выкладывать: в ней черновики.
"""
import html
import json
import os
import re
import sys
from datetime import date

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "_blog"))
from topics import TOPICS  # noqa: E402

SITE = "https://lokomotivneva.ru"
SECTION = "Блог"
BASE = "/blog/"
AUTHOR_DEFAULT = "Редакция ООО «Локомотив»"
MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа",
          "сентября", "октября", "ноября", "декабря"]
WITH_DRAFTS = "--drafts" in sys.argv
SITEMAP_START = "  <!-- blog:start (собирает _blog_gen.py, руками не править) -->"
SITEMAP_END = "  <!-- blog:end -->"
OLD_SITEMAP = ("  <!-- guides:start (собирает _guides_gen.py, руками не править) -->", "  <!-- guides:end -->")

esc = html.escape


def ru_date(iso):
    d = date.fromisoformat(iso)
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def strip_tags(s):
    return re.sub(r"<[^>]+>", " ", s)


def read_shell():
    """Шапка до <main> и подвал после </main> со страницы /trust/."""
    src = open(os.path.join(ROOT, "trust", "index.html"), encoding="utf-8").read()
    head, rest = src.split('<main id="main">', 1)
    foot = rest.split("</main>", 1)[1]
    return head, foot


def page(head, foot, *, title, desc, path, main, jsonld):
    h = re.sub(r"<title>.*?</title>", f"<title>{esc(title)} | ООО «Локомотив»</title>", head, count=1, flags=re.S)
    h = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{esc(desc)}">', h, count=1)
    h = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{SITE}{path}">', h, count=1)
    robots = '\n  <meta name="robots" content="noindex">' if WITH_DRAFTS else ""
    ld = robots + "".join(
        f'\n  <script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>' for x in jsonld)
    h = h.replace("</head>", f'  <link rel="stylesheet" href="/assets/css/blog.css?v=20261029blog">{ld}\n</head>', 1)
    return f'{h}<main id="main">\n{main}\n  </main>{foot}'


def crumbs_html(items):
    out = ['<li><a href="/">Главная</a></li>']
    for label, href in items:
        out.append(f'<li><a href="{href}">{esc(label)}</a></li>' if href else f'<li aria-current="page">{esc(label)}</li>')
    return f'<nav class="crumbs" aria-label="Хлебные крошки"><ol>{"".join(out)}</ol></nav>'


def crumbs_ld(items):
    elems = [("Главная", "/")] + items
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, **({"item": SITE + h} if h else {})}
        for i, (n, h) in enumerate(elems)]}


def load_articles():
    folder = os.path.join(ROOT, "_blog", "articles")
    arts = []
    for name in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
        if not name.endswith(".html"):
            continue
        raw = open(os.path.join(folder, name), encoding="utf-8").read()
        m = re.match(r"\s*<!--META\s*(\{.*?\})\s*-->\s*(.*)$", raw, re.S)
        if not m:
            sys.exit(f"{name}: нет шапки <!--META {{...}} -->")
        meta = json.loads(m.group(1))
        # Пометки <!--CHECK: ...--> — для сверки фактов, на сайт не выходят.
        meta["body"] = re.sub(r"\s*<!--\s*CHECK:.*?-->", "", m.group(2), flags=re.S).strip()
        meta.setdefault("slug", name[:-5])
        meta.setdefault("updated", meta["published"])
        meta.setdefault("author", AUTHOR_DEFAULT)
        if meta["topic"] not in {t["id"] for t in TOPICS}:
            sys.exit(f"{name}: неизвестная тема {meta['topic']}")
        required = ("title", "h1", "desc", "published") + (() if meta["topic"] == "news" else ("summary",))
        for key in required:
            if not meta.get(key):
                sys.exit(f"{name}: не заполнено поле {key}")
        if meta.get("draft") and not WITH_DRAFTS:
            continue
        arts.append(meta)
    arts.sort(key=lambda a: a["published"], reverse=True)
    return arts


def faq_html(faq):
    if not faq:
        return ""
    items = "".join(
        f'<details class="faq__item"><summary class="faq__q">{esc(q["q"])}</summary>'
        f'<div class="faq__a"><p>{q["a"]}</p></div></details>' for q in faq)
    return f'<h2 id="faq">Частые вопросы</h2><div class="faq guide__faq">{items}</div>'


def sources_html(sources):
    if not sources:
        return ""
    items = "".join(
        f'<li><a href="{esc(s["href"])}" target="_blank" rel="noopener nofollow">{esc(s["title"])}</a>'
        + (f' <span class="guide__src-note">{esc(s["note"])}</span>' if s.get("note") else "") + "</li>"
        for s in sources)
    return f'<h2 id="sources">Источники</h2><ol class="guide__sources">{items}</ol>'


def article_page(a, arts, head, foot):
    topic = next(t for t in TOPICS if t["id"] == a["topic"])
    path = f"{BASE}{a['slug']}/"
    news = a["topic"] == "news"
    words = len(strip_tags(a.get("summary", "") + a["body"]).split())
    minutes = max(1, round(words / 180))
    related = [x for x in arts if x["topic"] == a["topic"] and x["slug"] != a["slug"]][:3]
    product = a.get("product") or {"href": topic["products"][0][0], "text": topic["products"][0][1]}
    cta = (f'<aside class="guide__cta"><p>{a.get("cta_text") or "Если нужна помощь с платежом — расскажем, как это устроено у нас."}</p>'
           f'<div class="guide__cta-links"><a class="btn btn--navy" href="{product["href"]}">{esc(product["text"])}</a>'
           f'<a class="btn btn--gold" href="/#calc">Рассчитать платёж</a></div></aside>')
    rel = ""
    if related:
        rel = '<h2>Читайте также</h2><ul class="guide__related">' + "".join(
            f'<li><a href="{BASE}{r["slug"]}/">{esc(r["h1"])}</a></li>' for r in related) + "</ul>"
    video = ""
    if a.get("youtube"):
        video = (f'<div class="guide__video"><iframe src="https://www.youtube-nocookie.com/embed/{esc(a["youtube"])}" '
                 f'title="{esc(a["h1"])}" loading="lazy" allowfullscreen></iframe></div>')
    draft = '<p class="guide__draft">ЧЕРНОВИК — не опубликовано</p>' if a.get("draft") else ""
    main = f'''    <section class="page-hero page-hero--guide">
      <div class="hero__glow" aria-hidden="true"></div>
      <div class="container page-hero__inner guide__hero">
        {crumbs_html([(SECTION, BASE), (topic["title"], f"{BASE}#{topic['id']}"), (a["h1"], None)])}
        {draft}<h1>{esc(a["h1"])}</h1>
        <p class="guide__meta">Автор: {esc(a["author"])} · {"Опубликовано" if news and a["updated"] == a["published"] else "Обновлено"}: <time datetime="{a["updated"]}">{ru_date(a["updated"])}</time> · {minutes} мин чтения</p>
      </div>
    </section>
    <section class="section section--light"><div class="container guide">
      {f'<div class="guide__summary"><p class="guide__summary-label">Коротко</p>{a["summary"]}</div>' if a.get("summary") else ""}
      {video}
      <article class="prose guide__body">{a["body"]}</article>
      {cta}
      <div class="prose">{faq_html(a.get("faq"))}{sources_html(a.get("sources"))}{rel}</div>
      {"" if news else '<p class="guide__disclaimer">Статья носит справочный характер и не является юридической или налоговой консультацией. Нормы меняются — проверяйте актуальную редакцию по ссылкам в разделе «Источники».</p>'}
    </div></section>'''
    ld = [{
        "@context": "https://schema.org", "@type": "NewsArticle" if news else "Article", "headline": a["h1"], "description": a["desc"],
        "datePublished": a["published"], "dateModified": a["updated"], "inLanguage": "ru",
        "mainEntityOfPage": SITE + path,
        "author": {"@type": "Organization", "name": a["author"]} if a["author"] == AUTHOR_DEFAULT
        else {"@type": "Person", "name": a["author"]},
        "publisher": {"@type": "Organization", "name": "ООО «Локомотив»",
                      "logo": {"@type": "ImageObject", "url": SITE + "/assets/img/logo-160.jpg"}},
    }, crumbs_ld([(SECTION, BASE), (a["h1"], None)])]
    if a.get("faq"):
        # Только вопросы, видимые на странице, ответы дословно — как на страницах стран.
        ld.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q["q"],
             "acceptedAnswer": {"@type": "Answer", "text": re.sub(r"\s+", " ", strip_tags(q["a"])).strip()}}
            for q in a["faq"]]})
    return path, page(head, foot, title=a["title"], desc=a["desc"], path=path, main=main, jsonld=ld)


def index_page(arts, head, foot):
    """Лента: все записи, новые сверху. Фильтр по рубрикам — кнопки, их показывает
    assets/js/blog.js; без скрипта видна вся лента."""
    used = [t for t in TOPICS if any(a["topic"] == t["id"] for a in arts)]
    titles = {t["id"]: t["title"] for t in TOPICS}
    cards = "".join(
        f'<li class="guide-card{" guide-card--news" if a["topic"] == "news" else ""}" data-cat="{a["topic"]}">'
        f'<a href="{BASE}{a["slug"]}/"><span class="guide-card__cat">{esc(titles[a["topic"]])}</span>'
        f'<span class="guide-card__title">{esc(a["h1"])}</span>'
        f'<span class="guide-card__desc">{esc(a["desc"])}</span>'
        f'<span class="guide-card__date">{ru_date(a["published"])}</span></a></li>' for a in arts)
    feed = f'<ul class="guide-cards" id="blog-feed">{cards}</ul>' if arts else '<p class="blog-empty">Записи скоро появятся.</p>'
    buttons = '<button type="button" data-cat="" aria-pressed="true">Все записи</button>' + "".join(
        f'<button type="button" data-cat="{t["id"]}" aria-pressed="false">{esc(t["title"])}</button>' for t in used)
    # Якоря #рубрика из хлебных крошек статьи: скрипт по ним включает фильтр.
    main = f'''    <section class="page-hero">
      <div class="worldmap worldmap--hero" data-worldmap="hero" aria-hidden="true"></div>
      <div class="hero__glow" aria-hidden="true"></div>
      <div class="container page-hero__inner">
        {crumbs_html([(SECTION, None)])}
        <h1>Блог <span class="text-gold">«Локомотива»</span></h1>
        <p class="page-hero__lead">Новости компании и справочные статьи о платежах иностранным поставщикам, валютном контроле, агентской схеме и налогах. Пишем простым языком и даём ссылки на первоисточники.</p>
        <div class="blog-filter" data-blog-filter hidden role="group" aria-label="Рубрики">{buttons}</div>
      </div>
    </section>
    <section class="section section--light"><div class="container blog-feed">
      {feed}
    </div></section>
    <script src="/assets/js/blog.js?v=20261029blog" defer></script>'''
    ld = [crumbs_ld([(SECTION, None)])]
    if arts:
        ld.append({"@context": "https://schema.org", "@type": "ItemList", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": f"{SITE}{BASE}{a['slug']}/", "name": a["h1"]}
            for i, a in enumerate(arts)]})
    return page(head, foot, title="Блог: новости и статьи о платежах в ВЭД",
                desc="Новости ООО «Локомотив» и статьи о международных платежах для бизнеса: оплата поставщикам в Китай, Турцию, ОАЭ и Европу, валютный контроль, агентская схема.",
                path=BASE, main=main, jsonld=ld)


def write(rel, content):
    full = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)


def update_sitemap(arts):
    p = os.path.join(ROOT, "sitemap.xml")
    s = open(p, encoding="utf-8").read()
    for a, b in ((SITEMAP_START, SITEMAP_END), OLD_SITEMAP):
        s = re.sub(re.escape(a) + r".*?" + re.escape(b) + r"\n?", "", s, flags=re.S)
    if arts:
        last = max(a["updated"] for a in arts)
        urls = [(f"{SITE}{BASE}", last, "0.7")] + [(f"{SITE}{BASE}{a['slug']}/", a["updated"], "0.6") for a in arts]
        block = SITEMAP_START + "\n" + "".join(
            f"  <url>\n    <loc>{u}</loc>\n    <lastmod>{d}</lastmod>\n    <priority>{pr}</priority>\n  </url>\n"
            for u, d, pr in urls) + SITEMAP_END + "\n"
        s = s.replace("</urlset>", block + "</urlset>", 1)
    open(p, "w", encoding="utf-8").write(s)


def update_search(arts):
    p = os.path.join(ROOT, "assets", "search-index.json")
    idx = [x for x in json.load(open(p, encoding="utf-8")) if not x["url"].startswith(("/guides/", BASE))]
    if arts:
        idx.append({"url": BASE, "title": SECTION, "desc": "Новости компании и статьи о платежах, валютном контроле и налогах в ВЭД.",
                    "heads": [t["title"] for t in TOPICS], "tags": ["блог", "новости", "статьи", "база знаний", "справочник"]})
        for a in arts:
            heads = [re.sub(r"\s+", " ", strip_tags(h)).strip() for h in re.findall(r"<h2[^>]*>(.*?)</h2>", a["body"], re.S)]
            idx.append({"url": f"{BASE}{a['slug']}/", "title": a["h1"], "desc": a["desc"], "heads": heads,
                        "tags": a.get("tags", [])})
    idx.sort(key=lambda x: x["url"])
    json.dump(idx, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def clean_stale(arts):
    """Убрать папки статей, которых нет среди собираемых (черновики, переименованные)."""
    import shutil
    keep = {a["slug"] for a in arts}
    base = os.path.join(ROOT, BASE.strip("/"))
    for name in os.listdir(base) if os.path.isdir(base) else []:
        if os.path.isdir(os.path.join(base, name)) and name not in keep:
            shutil.rmtree(os.path.join(base, name))


def main():
    head, foot = read_shell()
    arts = load_articles()
    clean_stale(arts)
    write(BASE.strip("/") + "/index.html", index_page(arts, head, foot))
    for a in arts:
        path, content = article_page(a, arts, head, foot)
        write(path.strip("/") + "/index.html", content)
    if not WITH_DRAFTS:  # черновики не попадают ни в карту сайта, ни в поиск
        update_sitemap(arts)
        update_search(arts)
    print(f"blog: записей {len(arts)}" + (" (с черновиками)" if WITH_DRAFTS else ""))


if __name__ == "__main__":
    main()
