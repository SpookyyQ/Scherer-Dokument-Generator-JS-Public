(() => {
  const REPO = "SpookyyQ/Scherer-Dokument-Generator-JS-Public";
  const BRANCH = "main";
  const MAX_CHANGELOG_CARDS = 8;
  const MAX_ITEMS_PER_CARD = 4;

  function formatDate(dateValue) {
    if (!dateValue) return "-";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }

  async function loadPackageVersion() {
    const badge = document.getElementById("pkg-version-badge");
    if (!badge) return null;
    try {
      const response = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/package.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const pkg = await response.json();
      const version = typeof pkg.version === "string" ? pkg.version.trim() : "";
      if (!version) throw new Error("version missing");
      badge.textContent = `Version ${version}`;
      return version;
    } catch (_error) {
      badge.textContent = "Version unbekannt";
      return null;
    }
  }

  async function loadLatestRelease(packageVersion) {
    const versionNode = document.getElementById("latest-release-version");
    const dateNode = document.getElementById("latest-release-date");
    const downloadBtn = document.getElementById("cta-download");
    if (!versionNode || !dateNode) return;

    try {
      const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const release = await response.json();
      const tag = release.tag_name || "unbekannt";
      const published = release.published_at || release.created_at;

      versionNode.textContent = tag;
      dateNode.textContent = `Veröffentlicht: ${formatDate(published)}`;

      if (downloadBtn) {
        downloadBtn.href = release.html_url || `https://github.com/${REPO}/releases`;
        downloadBtn.textContent = `Download ${tag}`;
      }
    } catch (_error) {
      if (packageVersion) {
        versionNode.textContent = `v${packageVersion}`;
        dateNode.textContent = "Release-Datum nicht verfügbar";
      } else {
        versionNode.textContent = "nicht verfügbar";
        dateNode.textContent = "Release-Status konnte nicht geladen werden";
      }
      if (downloadBtn) {
        downloadBtn.href = `https://github.com/${REPO}/releases`;
        downloadBtn.textContent = packageVersion ? `Download v${packageVersion}` : "Download";
      }
    }
  }

  function parseChangelog(markdown) {
    const releases = [];
    const lines = markdown.split(/\r?\n/);
    let currentRelease = null;
    let currentSection = "";

    const releasePattern = /^##\s+\[?([^\]\s]+)\]?\s*-\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const releaseMatch = line.match(releasePattern);
      if (releaseMatch) {
        if (currentRelease) releases.push(currentRelease);
        currentRelease = {
          version: releaseMatch[1],
          date: releaseMatch[2],
          items: [],
        };
        currentSection = "";
        continue;
      }

      if (!currentRelease) continue;

      const sectionMatch = line.match(/^###\s+(.+)/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        continue;
      }

      const bulletMatch = line.match(/^-\s+(.+)/);
      if (bulletMatch) {
        const entry = bulletMatch[1].trim();
        const text = currentSection ? `${currentSection}: ${entry}` : entry;
        currentRelease.items.push(text);
      }
    }

    if (currentRelease) releases.push(currentRelease);
    return releases;
  }

  function buildChangelogCard(release) {
    const card = document.createElement("article");
    card.className = "changelog-card";

    const header = document.createElement("header");
    const title = document.createElement("h3");
    const date = document.createElement("span");

    const normalizedVersion = release.version.startsWith("v") ? release.version : `v${release.version}`;
    title.textContent = normalizedVersion;
    date.textContent = formatDate(release.date);

    header.appendChild(title);
    header.appendChild(date);
    card.appendChild(header);

    if (release.items.length > 0) {
      const list = document.createElement("ul");
      release.items.slice(0, MAX_ITEMS_PER_CARD).forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
      });
      card.appendChild(list);
    }

    return card;
  }

  async function loadChangelog() {
    const container = document.getElementById("changelog-grid");
    if (!container) return;

    try {
      const response = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/CHANGELOG.md`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const markdown = await response.text();
      const releases = parseChangelog(markdown).slice(0, MAX_CHANGELOG_CARDS);

      container.innerHTML = "";
      if (releases.length === 0) {
        const fallback = document.createElement("article");
        fallback.className = "changelog-card";
        const h = document.createElement("h3");
        h.textContent = "Keine Einträge gefunden";
        fallback.appendChild(h);
        container.appendChild(fallback);
        return;
      }

      releases.forEach((release) => {
        container.appendChild(buildChangelogCard(release));
      });
    } catch (_error) {
      container.innerHTML = "";
      const fallback = document.createElement("article");
      fallback.className = "changelog-card";
      const header = document.createElement("header");
      const h = document.createElement("h3");
      const s = document.createElement("span");
      h.textContent = "Changelog nicht geladen";
      s.textContent = "Bitte später erneut versuchen";
      header.appendChild(h);
      header.appendChild(s);
      fallback.appendChild(header);
      container.appendChild(fallback);
    }
  }

  function initReveal() {
    const targets = document.querySelectorAll(".section, .hero-content");
    if (targets.length === 0) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      targets.forEach((node) => node.classList.add("is-visible"));
      return;
    }

    targets.forEach((node) => node.classList.add("reveal"));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );

    targets.forEach((node) => observer.observe(node));
  }

  document.addEventListener("DOMContentLoaded", () => {
    initReveal();
    loadPackageVersion().then((packageVersion) => {
      loadLatestRelease(packageVersion);
    });
    loadChangelog();
  });
})();
