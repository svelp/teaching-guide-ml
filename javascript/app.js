pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const pdfUrl = "../config/guide.pdf";
const pdfRequestUrl = `${pdfUrl}?v=${Date.now()}`;
const container = document.getElementById("pdf-content");
const pageJumpForm = document.getElementById("page-jump-form");
const pageJumpInput = document.getElementById("page-jump-input");
const pageJumpStatus = document.getElementById("page-jump-status");
const renderScale = 1;

let hotspotsConfig = null;
let pdfDocument = null;
let pageObserver = null;
let renderQueue = Promise.resolve();
let activeJumpPage = null;
const renderedPages = new Set();
const renderingPages = new Set();

const defaultHotspotStyle = {
    visible: false,
    border: "2px dashed #ff3c3c",
    background: "rgba(255, 0, 0, 0.15)"
};

const audioPlayer = {

    current: null,

    play(src) {
        if (this.current) {
            this.current.onended = null;
            this.current.pause();
            this.current.currentTime = 0;
        }

        const nextAudio = new Audio(src);
        this.current = nextAudio;

        nextAudio.play().catch(err => {
            if (err?.name === "AbortError") return;
            console.error("Error playing audio:", err);
        });

        nextAudio.onended = () => {
            if (this.current === nextAudio) {
                this.current = null;
            }
        };
    },

    stop() {
        if (!this.current) return;
        this.current.onended = null;
        this.current.pause();
        this.current.currentTime = 0;
        this.current = null;
    },

    setVolume(volume) {
        if (this.current) {
            this.current.volume = volume;
        }
    }

};

async function loadHotspots() {
    const response = await fetch("../config/hotspots.json");
    hotspotsConfig = await response.json();
}

async function renderPDF() {
    await loadHotspots();
    pdfDocument = await pdfjsLib.getDocument(pdfRequestUrl).promise;
    const pageFragments = document.createDocumentFragment();
    const firstPage = await pdfDocument.getPage(1);
    const firstViewport = firstPage.getViewport({
        scale: renderScale
    });
    const pageAspectRatio = `${firstViewport.width}/${firstViewport.height}`;
    firstPage.cleanup();

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
        const pageDiv = document.createElement("div");
        pageDiv.className = "page";
        pageDiv.dataset.pageNumber = String(pageNumber);
        pageDiv.style.aspectRatio = pageAspectRatio;

        const loader = document.createElement("div");
        loader.className = "page-loader";
        loader.innerHTML = '<div class="spinner" aria-hidden="true"></div>' +
            `<span class="sr-only">Cargando página ${pageNumber}</span>`;

        pageDiv.appendChild(loader);
        pageFragments.appendChild(pageDiv);
    }

    container.appendChild(pageFragments);

    if (!pageObserver) {
        pageObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const pageNumber = Number(entry.target.dataset.pageNumber);
                    queuePageRender(pageNumber, entry.target);
                }
            });
        }, {
            root: null,
            rootMargin: "1000px 0px",
            threshold: 0.01
        });
    }

    Array.from(container.querySelectorAll(".page")).forEach(pageDiv => {
        pageObserver.observe(pageDiv);
    });

    setupPageJumpSelector(pdfDocument.numPages);
}

function setupPageJumpSelector(totalPages) {
    if (!pageJumpForm || !pageJumpInput || !pageJumpStatus) {
        return;
    }

    const pageJumpButton = pageJumpForm.querySelector("button[type='submit']");
    if (!pageJumpButton) {
        return;
    }

    pageJumpInput.max = String(totalPages);
    pageJumpInput.disabled = false;
    pageJumpButton.disabled = false;
    pageJumpStatus.textContent = `Escribe una página entre 1 y ${totalPages}.`;
    pageJumpStatus.className = "page-jump-status";

    pageJumpForm.addEventListener("submit", event => {
        event.preventDefault();
        const pageNumber = Number.parseInt(pageJumpInput.value, 10);
        jumpToPage(pageNumber);
    });
}

function setPageJumpStatus(message, tone = "") {
    if (!pageJumpStatus) {
        return;
    }

    pageJumpStatus.textContent = message;
    pageJumpStatus.className = tone ? `page-jump-status ${tone}` : "page-jump-status";
}

function getPageElement(pageNumber) {
    return container.querySelector(`.page[data-page-number="${pageNumber}"]`);
}

function updatePageJumpFeedback(pageNumber) {
    if (!pageJumpStatus || !pdfDocument) {
        return;
    }

    if (renderedPages.has(pageNumber)) {
        setPageJumpStatus(`La página ${pageNumber} ya está lista.`, "is-success");
        return;
    }

    if (renderingPages.has(pageNumber)) {
        setPageJumpStatus(`La página ${pageNumber} todavía se está cargando.`, "is-warning");
        return;
    }

    setPageJumpStatus(`La página ${pageNumber} aún no ha cargado. La estoy preparando.`, "is-warning");
}

function jumpToPage(pageNumber) {
    if (!pdfDocument || !Number.isInteger(pageNumber)) {
        setPageJumpStatus("Escribe un número de página válido.", "is-error");
        return;
    }

    if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
        setPageJumpStatus(`Elige una página entre 1 y ${pdfDocument.numPages}.`, "is-error");
        return;
    }

    const pageDiv = getPageElement(pageNumber);
    if (!pageDiv) {
        setPageJumpStatus(`La página ${pageNumber} todavía no está disponible en pantalla.`, "is-warning");
        return;
    }

    activeJumpPage = pageNumber;
    queuePageRender(pageNumber, pageDiv);
    pageDiv.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
    updatePageJumpFeedback(pageNumber);
}

function queuePageRender(pageNumber, pageDiv) {
    if (!pdfDocument || renderedPages.has(pageNumber) || renderingPages.has(pageNumber)) {
        return;
    }

    renderingPages.add(pageNumber);
    renderQueue = renderQueue.then(() => renderPage(pageNumber, pageDiv));
}

async function renderPage(pageNumber, pageDiv) {
    try {
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({
            scale: renderScale
        });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext("2d");
        const loader = pageDiv.querySelector(".page-loader");

        pageDiv.appendChild(canvas);

        await page.render({
            canvasContext: context,
            viewport
        }).promise;

        page.cleanup();

        if (loader && loader.parentNode) {
            loader.parentNode.removeChild(loader);
        }

        pageDiv.classList.add("rendered");
        createHotspots(pageDiv, pageNumber);
        renderedPages.add(pageNumber);
        if (activeJumpPage === pageNumber) {
            setPageJumpStatus(`La página ${pageNumber} ya está lista.`, "is-success");
        }
    } catch (error) {
        console.error(`Error rendering PDF page ${pageNumber}:`, error);
        if (activeJumpPage === pageNumber) {
            setPageJumpStatus(`No se pudo cargar la página ${pageNumber}.`, "is-error");
        }
    } finally {
        renderingPages.delete(pageNumber);
    }
}

function createHotspots(pageDiv, pageNumber) {
    const pageInfo = hotspotsConfig.pages.find(p => p.page === pageNumber);
    const hotspotStyle = {
        ...defaultHotspotStyle,
        ...(hotspotsConfig.hotspotStyle || {})
    };

    if (!pageInfo) return;
    pageInfo.hotspots.forEach(h => {
        const zone = document.createElement("div");

        zone.className = "hotspot";
        zone.style.left = (h.x * 100) + "%";
        zone.style.top = (h.y * 100) + "%";
        zone.style.width = (h.width * 100) + "%";
        zone.style.height = (h.height * 100) + "%";
        zone.style.border = hotspotStyle.visible ? hotspotStyle.border : "none";
        zone.style.background = hotspotStyle.visible ? hotspotStyle.background : "transparent";
        zone.addEventListener("click", () => {
            audioPlayer.play(h.audio);
        });
        pageDiv.appendChild(zone);
    });
}

renderPDF();