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
