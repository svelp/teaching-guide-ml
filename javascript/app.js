pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const url = "../config/guide.pdf";
const container = document.getElementById("pdf-content");

pdfjsLib.getDocument(url).promise.then(async (pdf) => {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });
        const pageDiv = document.createElement("div");
        pageDiv.className = "page";
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        pageDiv.appendChild(canvas);
        container.appendChild(pageDiv);
        await page.render({
            canvasContext: context,
            viewport
        }).promise;
    }
}).catch(console.error);