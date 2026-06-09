const contentStore = window.SiteContentStore;
const fallbackContent = contentStore ? contentStore.loadConfig() : window.siteConfig || {};
const placeholderImage =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#f5f5f7"/><text x="50%" y="48%" text-anchor="middle" fill="#8a8a8e" font-family="Arial, sans-serif" font-size="40">Upload</text><text x="50%" y="56%" text-anchor="middle" fill="#8a8a8e" font-family="Arial, sans-serif" font-size="40">Scientific Artwork</text></svg>',
  );

const gallery = document.querySelector("#gallery");
const filterButtons = document.querySelectorAll(".filter-button");
const lightbox = document.querySelector(".lightbox");
const lightboxImage = lightbox.querySelector("img");
const lightboxCaption = lightbox.querySelector("figcaption");
const closeLightbox = lightbox.querySelector(".lightbox-close");
const caseCountNode = document.querySelector("[data-case-count]");
const loadMoreButton = document.querySelector("#load-more-works");
const INITIAL_CASES = 12;
let lastFocusedElement = null;
let siteContent = fallbackContent;
let activeFilter = "all";
let visibleCaseCount = INITIAL_CASES;

function getCases() {
  return siteContent.cases || [];
}

function getHeroImages() {
  return siteContent.heroImages || [];
}

function getFilteredCases() {
  const cases = getCases();
  if (activeFilter === "all") {
    return cases;
  }

  return cases.filter((entry) => {
    const categories = String(entry.categories || "")
      .split(" ")
      .map((item) => item.trim())
      .filter(Boolean);
    return categories.includes(activeFilter);
  });
}

async function loadSiteContent() {
  try {
    const response = await fetch("/api/content", {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("API unavailable");
    }

    const payload = await response.json();
    if (payload?.ok && payload.content) {
      return payload.content;
    }
  } catch (error) {
    console.warn("Using fallback site content:", error.message);
  }

  return fallbackContent;
}

function applyHeroImages() {
  document.querySelectorAll(".hero-image").forEach((image, index) => {
    const imageConfig = getHeroImages()[index];

    if (!imageConfig) {
      return;
    }

    image.src = imageConfig.src || placeholderImage;
    image.alt = imageConfig.alt || "";
  });
}

function renderGallery() {
  const filteredCases = getFilteredCases();
  const visibleCases = filteredCases.slice(0, visibleCaseCount);

  if (caseCountNode) {
    caseCountNode.textContent =
      activeFilter === "all"
        ? `${getCases().length} 个精选案例`
        : `${filteredCases.length} 个筛选结果`;
  }

  gallery.innerHTML = visibleCases
    .map((entry) => {
      const school = entry.school || "未命名机构";
      const journal = entry.journal || "未填写期刊";
      const description = entry.description || "等待补充作品说明";
      const categories = entry.categories || "";
      const title = `${school} · ${journal}`;
      const thumbSource = entry.thumbSrc || entry.largeSrc || placeholderImage;
      const largeSource = entry.largeSrc || entry.thumbSrc || placeholderImage;
      return `
        <article class="case-card" data-category="${categories}">
          <button class="case-preview" type="button" data-large="${largeSource}" data-title="${title}">
            <img
              src="${thumbSource}"
              alt="${entry.alt || `${title} 科研绘图案例`}"
              decoding="async"
              data-large-src="${largeSource}"
            />
          </button>
          <div class="case-meta">
            <span>${school}</span>
            <strong>${journal}</strong>
            <em>${description}</em>
          </div>
        </article>
      `;
    })
    .join("");

  if (loadMoreButton) {
    const hasMore = visibleCases.length < filteredCases.length;
    loadMoreButton.hidden = !hasMore;
    loadMoreButton.disabled = !hasMore;
    loadMoreButton.textContent = "加载更多作品";
  }
}

function bindGalleryEvents() {
  document.querySelectorAll(".case-preview img").forEach((image) => {
    image.addEventListener("error", () => {
      const largeSource = image.dataset.largeSrc || "";
      if (largeSource && image.src !== largeSource && !image.dataset.triedLargeFallback) {
        image.dataset.triedLargeFallback = "true";
        image.src = largeSource;
        return;
      }

      image.src = placeholderImage;
    });
  });

  document.querySelectorAll(".case-preview").forEach((button) => {
    button.addEventListener("click", () => {
      lastFocusedElement = document.activeElement;
      lightboxImage.src = button.dataset.large;
      lightboxImage.alt = button.querySelector("img").alt;
      lightboxCaption.textContent = button.dataset.title;
      lightbox.classList.add("is-open");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      closeLightbox.focus();
    });
  });
}

function applyFilter(filter) {
  activeFilter = filter;
  visibleCaseCount = INITIAL_CASES;
  renderGallery();
  bindGalleryEvents();
}

function hideLightbox() {
  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImage.src = "";
  document.body.style.overflow = "";

  if (lastFocusedElement) {
    lastFocusedElement.focus();
  }
}

async function init() {
  siteContent = await loadSiteContent();
  applyHeroImages();
  renderGallery();
  bindGalleryEvents();
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    applyFilter(button.dataset.filter);
  });
});

if (loadMoreButton) {
  loadMoreButton.addEventListener("click", () => {
    visibleCaseCount += INITIAL_CASES;
    renderGallery();
    bindGalleryEvents();
  });
}

closeLightbox.addEventListener("click", hideLightbox);

lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) {
    hideLightbox();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && lightbox.classList.contains("is-open")) {
    hideLightbox();
  }
});

init();
