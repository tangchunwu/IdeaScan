import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export const exportToPdf = async (elementId: string, fileName: string = "report") => {
       const element = document.getElementById(elementId);
       if (!element) {
              console.error("Element not found");
              return;
       }

       try {
              const canvas = await html2canvas(element, {
                     scale: 2,
                     useCORS: true,
                     logging: false,
              });

              const imgData = canvas.toDataURL("image/png");
              const pdf = new jsPDF({
                     orientation: "portrait",
                     unit: "px",
                     format: [canvas.width, canvas.height],
              });

              pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
              pdf.save(`${fileName}.pdf`);
       } catch (error) {
              console.error("Export to PDF failed:", error);
              throw error;
       }
};

// Multi-page PDF export from HTML content
export const exportToMultiPagePdf = async (htmlContent: string, fileName: string = "report") => {
       try {
              // Create a hidden container for rendering
              const container = document.createElement("div");
              container.style.cssText = `
                     position: fixed;
                     left: -9999px;
                     top: 0;
                     width: 794px;
                     background: white;
                     z-index: -1000;
              `;
              container.innerHTML = htmlContent;
              document.body.appendChild(container);

              // Wait for content to render
              await new Promise(resolve => setTimeout(resolve, 200));

              // Capture the entire container as one big canvas
              const fullCanvas = await html2canvas(container, {
                     scale: 1.5,
                     useCORS: true,
                     logging: false,
                     backgroundColor: "#ffffff",
              });

              // A4 dimensions in mm
              const pdfWidth = 210;
              const pdfHeight = 297;
              const margin = 10;
              const contentWidth = pdfWidth - margin * 2;
              const contentHeight = pdfHeight - margin * 2;

              // Calculate how many pixels correspond to one A4 page height
              const pageHeightPx = (contentHeight / contentWidth) * fullCanvas.width;
              const totalPages = Math.ceil(fullCanvas.height / pageHeightPx);

              const pdf = new jsPDF({
                     orientation: "portrait",
                     unit: "mm",
                     format: "a4",
              });

              for (let i = 0; i < totalPages; i++) {
                     const sliceCanvas = document.createElement("canvas");
                     sliceCanvas.width = fullCanvas.width;
                     const remainingHeight = fullCanvas.height - i * pageHeightPx;
                     const currentSliceHeight = Math.min(pageHeightPx, remainingHeight);
                     sliceCanvas.height = currentSliceHeight;

                     const ctx = sliceCanvas.getContext("2d");
                     if (ctx) {
                            ctx.drawImage(
                                   fullCanvas,
                                   0, i * pageHeightPx, fullCanvas.width, currentSliceHeight,
                                   0, 0, fullCanvas.width, currentSliceHeight
                            );
                     }

                     const imgData = sliceCanvas.toDataURL("image/jpeg", 0.75);
                     const sliceHeightMm = (currentSliceHeight / fullCanvas.width) * contentWidth;

                     if (i > 0) {
                            pdf.addPage();
                     }

                     pdf.addImage(imgData, "JPEG", margin, margin, contentWidth, sliceHeightMm);
              }

              // Cleanup
              document.body.removeChild(container);

              pdf.save(`${fileName}.pdf`);
       } catch (error) {
              console.error("Export to Multi-page PDF failed:", error);
              throw error;
       }
};

export const exportToImage = async (elementId: string, fileName: string = "report") => {
       const element = document.getElementById(elementId);
       if (!element) {
              console.error("Element not found:", elementId);
              throw new Error("Element not found");
       }

       try {
              const canvas = await html2canvas(element, {
                     scale: 2,
                     useCORS: true,
              });

              const link = document.createElement("a");
              link.href = canvas.toDataURL("image/png");
              link.download = (`${fileName}.png`);
              link.click();
       } catch (error) {
              console.error("Export to Image failed:", error);
              throw error;
       }
};

export const exportToHTML = (htmlContent: string, fileName: string = "report") => {
       try {
              const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              
              const link = document.createElement("a");
              link.href = url;
              link.download = `${fileName}.html`;
              link.click();
              
              // Cleanup
              URL.revokeObjectURL(url);
       } catch (error) {
              console.error("Export to HTML failed:", error);
              throw error;
       }
};
