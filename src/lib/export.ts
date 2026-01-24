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
              await new Promise(resolve => setTimeout(resolve, 100));

              // Find all pages
              const pages = container.querySelectorAll(".page");
              
              // A4 dimensions in mm: 210 x 297
              const pdf = new jsPDF({
                     orientation: "portrait",
                     unit: "mm",
                     format: "a4",
              });

              const pdfWidth = 210;
              const pdfHeight = 297;
              const margin = 10;
              const contentWidth = pdfWidth - (margin * 2);

              for (let i = 0; i < pages.length; i++) {
                     const page = pages[i] as HTMLElement;
                     
                     // Render page to canvas
                     const canvas = await html2canvas(page, {
                            scale: 2,
                            useCORS: true,
                            logging: false,
                            backgroundColor: "#ffffff",
                     });

                     const imgData = canvas.toDataURL("image/png");
                     const imgWidth = contentWidth;
                     const imgHeight = (canvas.height * imgWidth) / canvas.width;

                     // Add new page if not first
                     if (i > 0) {
                            pdf.addPage();
                     }

                     // Center the image on the page
                     const xOffset = margin;
                     const yOffset = margin;

                     pdf.addImage(imgData, "PNG", xOffset, yOffset, imgWidth, Math.min(imgHeight, pdfHeight - (margin * 2)));
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
