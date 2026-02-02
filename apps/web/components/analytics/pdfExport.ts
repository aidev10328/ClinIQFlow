import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export async function generatePdf(
  element: HTMLElement | null,
  filename: string,
  options?: { orientation?: 'portrait' | 'landscape' }
): Promise<void> {
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/png');
  const orientation = options?.orientation || 'portrait';
  const pdf = new jsPDF(orientation, 'mm', 'a4');

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;

  const imgWidth = contentWidth;
  const imgHeight = (canvas.height * contentWidth) / canvas.width;

  let yOffset = 0;
  let remainingHeight = imgHeight;

  while (remainingHeight > 0) {
    if (yOffset > 0) pdf.addPage();

    pdf.addImage(imgData, 'PNG', margin, margin - yOffset, imgWidth, imgHeight);

    remainingHeight -= (pageHeight - margin * 2);
    yOffset += (pageHeight - margin * 2);
  }

  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(
      `Generated on ${new Date().toLocaleString()} | Page ${i} of ${totalPages}`,
      pageWidth / 2, pageHeight - 5,
      { align: 'center' }
    );
  }

  pdf.save(`${filename}.pdf`);
}

export async function viewPdf(
  element: HTMLElement | null,
  filename: string,
  options?: { orientation?: 'portrait' | 'landscape' }
): Promise<void> {
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/png');
  const orientation = options?.orientation || 'portrait';
  const pdf = new jsPDF(orientation, 'mm', 'a4');

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;

  const imgWidth = contentWidth;
  const imgHeight = (canvas.height * contentWidth) / canvas.width;

  let yOffset = 0;
  let remainingHeight = imgHeight;

  while (remainingHeight > 0) {
    if (yOffset > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', margin, margin - yOffset, imgWidth, imgHeight);
    remainingHeight -= (pageHeight - margin * 2);
    yOffset += (pageHeight - margin * 2);
  }

  const pdfBlob = pdf.output('blob');
  const url = URL.createObjectURL(pdfBlob);
  window.open(url, '_blank');
}
