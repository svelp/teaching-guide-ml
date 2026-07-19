pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const pdfUrl = "../config/guide.pdf";
const container = document.getElementById("pdf-content");

let hotspotsConfig = null;

async function loadHotspots() {
    const response = await fetch("../config/hotspots.json");
    hotspotsConfig = await response.json();
}

async function renderPDF() {
    await loadHotspots();
    const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({
            scale: 1.5
        });
        const pageDiv = document.createElement("div");
        pageDiv.className = "page";
        pageDiv.style.width = viewport.width + "px";
        pageDiv.style.height = viewport.height + "px";
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        pageDiv.appendChild(canvas);
        container.appendChild(pageDiv);
        await page.render({
            canvasContext: context,
            viewport
        }).promise;
        createHotspots(pageDiv, pageNumber);
    }
}

function createHotspots(pageDiv, pageNumber) {
    const pageInfo = hotspotsConfig.pages.find(p => p.page === pageNumber);
    if (!pageInfo) return;
    pageInfo.hotspots.forEach(h => {
        const zone = document.createElement("div");
        zone.className = "hotspot";
        zone.classList.add("debug");
        zone.style.left = (h.x * 100) + "%";
        zone.style.top = (h.y * 100) + "%";
        zone.style.width = (h.width * 100) + "%";
        zone.style.height = (h.height * 100) + "%";
        zone.onclick = () => {
            const audio = new Audio(h.audio);
            audio.play();
        };
        pageDiv.appendChild(zone);
    });
}
renderPDF();