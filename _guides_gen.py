#!/usr/bin/env python3
"""Генератор раздела «База знаний ВЭД» (/guides/), Тати 2026-10-28.

Статья пишется одним файлом _guides/articles/<slug>.html: сверху JSON-шапка в
комментарии <!--META ... -->, ниже — текст статьи (HTML). Генератор собирает:
  /guides/index.html          — главная раздела, статьи по темам;
  /guides/<slug>/index.html   — страница статьи;
  sitemap.xml                 — блок адресов раздела между маркерами;
  assets/search-index.json    — записи раздела для поиска по сайту.

Шапка и подвал берутся с живой страницы /trust/ — меню, счётчики и скрипты
у раздела всегда такие же, как на остальном сайте.

Черновики (\"draft\": true) не собираются. Посмотреть их локально:
  python3 _guides_gen.py --drafts
⚠️ Папку _guides/ на сервер не выкладывать: в ней черновики.
"""
import html
import json
import os
import re
import sys
from datetime import date

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "_guides"))
from topics import TOPICS  # noqa: E402

SITE = "https://lokomotivneva.ru"
SECTION = "База знаний ВЭД"
AUTHOR_DEFAULT = "Редакция ООО «Локомотив»"
MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа",
          "сентября", "октября", "ноября", "декабря"]
WITH_DRAFTS = "--drafts" in sys.argv
SITEMAP_START = "  <!-- guides:start (собирает _guides_gen.py, руками не править) -->"
SITEMAP_END = "  <!-- guides:end -->"

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
    h = h.replace("</head>", f'  <link rel="stylesheet" href="/assets/css/guides.css?v=20261029fig">{ld}\n</head>', 1)
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
    folder = os.path.join(ROOT, "_guides", "articles")
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
        for key in ("title", "h1", "desc", "summary", "published"):
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
    path = f"/guides/{a['slug']}/"
    words = len(strip_tags(a["summary"] + a["body"]).split())
    minutes = max(1, round(words / 180))
    related = [x for x in arts if x["topic"] == a["topic"] and x["slug"] != a["slug"]][:3]
    product = a.get("product") or {"href": topic["products"][0][0], "text": topic["products"][0][1]}
    cta = (f'<aside class="guide__cta"><p>{a.get("cta_text") or "Если нужна помощь с платежом — расскажем, как это устроено у нас."}</p>'
           f'<div class="guide__cta-links"><a class="btn btn--navy" href="{product["href"]}">{esc(product["text"])}</a>'
           f'<a class="btn btn--gold" href="/#calc">Рассчитать платёж</a></div></aside>')
    rel = ""
    if related:
        rel = '<h2>Читайте также</h2><ul class="guide__related">' + "".join(
            f'<li><a href="/guides/{r["slug"]}/">{esc(r["h1"])}</a></li>' for r in related) + "</ul>"
    video = ""
    if a.get("youtube"):
        video = (f'<div class="guide__video"><iframe src="https://www.youtube-nocookie.com/embed/{esc(a["youtube"])}" '
                 f'title="{esc(a["h1"])}" loading="lazy" allowfullscreen></iframe></div>')
    draft = '<p class="guide__draft">ЧЕРНОВИК — не опубликовано</p>' if a.get("draft") else ""
    main = f'''    <section class="page-hero page-hero--guide">
      <div class="hero__glow" aria-hidden="true"></div>
      <div class="container page-hero__inner guide__hero">
        {crumbs_html([(SECTION, "/guides/"), (topic["title"], f"/guides/#{topic['id']}"), (a["h1"], None)])}
        {draft}<h1>{esc(a["h1"])}</h1>
        <p class="guide__meta">Автор: {esc(a["author"])} · Обновлено: <time datetime="{a["updated"]}">{ru_date(a["updated"])}</time> · {minutes} мин чтения</p>
      </div>
    </section>
    <section class="section section--light"><div class="container guide">
      <div class="guide__summary"><p class="guide__summary-label">Коротко</p>{a["summary"]}</div>
      {video}
      <article class="prose guide__body">{a["body"]}</article>
      {cta}
      <div class="prose">{faq_html(a.get("faq"))}{sources_html(a.get("sources"))}{rel}</div>
      <p class="guide__disclaimer">Статья носит справочный характер и не является юридической или налоговой консультацией. Нормы меняются — проверяйте актуальную редакцию по ссылкам в разделе «Источники».</p>
    </div></section>'''
    ld = [{
        "@context": "https://schema.org", "@type": "Article", "headline": a["h1"], "description": a["desc"],
        "datePublished": a["published"], "dateModified": a["updated"], "inLanguage": "ru",
        "mainEntityOfPage": SITE + path,
        "author": {"@type": "Organization", "name": a["author"]} if a["author"] == AUTHOR_DEFAULT
        else {"@type": "Person", "name": a["author"]},
        "publisher": {"@type": "Organization", "name": "ООО «Локомотив»",
                      "logo": {"@type": "ImageObject", "url": SITE + "/assets/img/logo-160.jpg"}},
    }, crumbs_ld([(SECTION, "/guides/"), (a["h1"], None)])]
    if a.get("faq"):
        # Только вопросы, видимые на странице, ответы дословно — как на страницах стран.
        ld.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q["q"],
             "acceptedAnswer": {"@type": "Answer", "text": re.sub(r"\s+", " ", strip_tags(q["a"])).strip()}}
            for q in a["faq"]]})
    return path, page(head, foot, title=a["title"], desc=a["desc"], path=path, main=main, jsonld=ld)


def index_page(arts, head, foot):
    blocks = []
    for t in TOPICS:
        mine = [a for a in arts if a["topic"] == t["id"]]
        cards = "".join(
            f'<li class="guide-card"><a href="/guides/{a["slug"]}/"><span class="guide-card__title">{esc(a["h1"])}</span>'
            f'<span class="guide-card__desc">{esc(a["desc"])}</span>'
            f'<span class="guide-card__date">Обновлено {ru_date(a["updated"])}</span></a></li>' for a in mine)
        body = f'<ul class="guide-cards">{cards}</ul>' if mine else '<p class="guide-topic__empty">Статьи по этой теме готовятся.</p>'
        products = "".join(f'<a class="guide-topic__chip" href="{h}">{esc(n)}</a>' for h, n in t["products"])
        blocks.append(f'''      <section class="guide-topic" id="{t["id"]}">
        <h2>{esc(t["title"])}</h2>
        <p class="guide-topic__lead">{esc(t["lead"])}</p>
        {body}
        <div class="guide-topic__chips">{products}</div>
      </section>''')
    main = f'''    <section class="page-hero">
      <div class="worldmap worldmap--hero" data-worldmap="hero" aria-hidden="true"></div>
      <div class="hero__glow" aria-hidden="true"></div>
      <div class="container page-hero__inner">
        {crumbs_html([(SECTION, None)])}
        <h1>База знаний <span class="text-gold">ВЭД</span></h1>
        <p class="page-hero__lead">Справочные статьи о платежах иностранным поставщикам, валютном контроле, агентской схеме и налогах. Пишем простым языком и даём ссылки на первоисточники.</p>
        <nav class="guide-toc" aria-label="Темы">{"".join(f'<a href="#{t["id"]}">{esc(t["title"])}</a>' for t in TOPICS)}</nav>
      </div>
    </section>
    <section class="section section--light"><div class="container guide-index">
{chr(10).join(blocks)}
    </div></section>'''
    ld = [crumbs_ld([(SECTION, None)])]
    if arts:
        ld.append({"@context": "https://schema.org", "@type": "ItemList", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": f"{SITE}/guides/{a['slug']}/", "name": a["h1"]}
            for i, a in enumerate(arts)]})
    return page(head, foot, title="База знаний ВЭД: платежи, валютный контроль, налоги",
                desc="Справочные статьи о международных платежах для бизнеса: оплата поставщикам в Китай, Турцию, ОАЭ и Европу, валютный контроль, агентская схема, НДС при импорте.",
                path="/guides/", main=main, jsonld=ld)


def write(rel, content):
    full = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)


def update_sitemap(arts):
    p = os.path.join(ROOT, "sitemap.xml")
    s = open(p, encoding="utf-8").read()
    s = re.sub(re.escape(SITEMAP_START) + r".*?" + re.escape(SITEMAP_END) + r"\n?", "", s, flags=re.S)
    if arts:
        last = max(a["updated"] for a in arts)
        urls = [(f"{SITE}/guides/", last, "0.7")] + [(f"{SITE}/guides/{a['slug']}/", a["updated"], "0.6") for a in arts]
        block = SITEMAP_START + "\n" + "".join(
            f"  <url>\n    <loc>{u}</loc>\n    <lastmod>{d}</lastmod>\n    <priority>{pr}</priority>\n  </url>\n"
            for u, d, pr in urls) + SITEMAP_END + "\n"
        s = s.replace("</urlset>", block + "</urlset>", 1)
    open(p, "w", encoding="utf-8").write(s)


def update_search(arts):
    p = os.path.join(ROOT, "assets", "search-index.json")
    idx = [x for x in json.load(open(p, encoding="utf-8")) if not x["url"].startswith("/guides/")]
    if arts:
        idx.append({"url": "/guides/", "title": SECTION, "desc": "Справочные статьи о платежах, валютном контроле и налогах в ВЭД.",
                    "heads": [t["title"] for t in TOPICS], "tags": ["статьи", "база знаний", "справочник", "блог"]})
        for a in arts:
            heads = [re.sub(r"\s+", " ", strip_tags(h)).strip() for h in re.findall(r"<h2[^>]*>(.*?)</h2>", a["body"], re.S)]
            idx.append({"url": f"/guides/{a['slug']}/", "title": a["h1"], "desc": a["desc"], "heads": heads,
                        "tags": a.get("tags", [])})
    idx.sort(key=lambda x: x["url"])
    json.dump(idx, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def clean_stale(arts):
    """Убрать папки статей, которых нет среди собираемых (черновики, переименованные)."""
    import shutil
    keep = {a["slug"] for a in arts}
    base = os.path.join(ROOT, "guides")
    for name in os.listdir(base) if os.path.isdir(base) else []:
        if os.path.isdir(os.path.join(base, name)) and name not in keep:
            shutil.rmtree(os.path.join(base, name))


def main():
    head, foot = read_shell()
    arts = load_articles()
    clean_stale(arts)
    write("guides/index.html", index_page(arts, head, foot))
    for a in arts:
        path, content = article_page(a, arts, head, foot)
        write(path.strip("/") + "/index.html", content)
    if not WITH_DRAFTS:  # черновики не попадают ни в карту сайта, ни в поиск
        update_sitemap(arts)
        update_search(arts)
    print(f"guides: статей {len(arts)}" + (" (с черновиками)" if WITH_DRAFTS else ""))


if __name__ == "__main__":
    main()
