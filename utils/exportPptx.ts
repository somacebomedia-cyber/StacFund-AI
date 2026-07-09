export async function exportSlidesToPptx(
  slides: any[],
  theme: any,
  filename: string,
  businessName?: string
): Promise<void> {
  console.log('PPTX export triggered client-side with slides:', slides);
  alert('Exporting client-side PPTX: ' + filename + '. Please upload the exportPptx.ts file to enable full native PowerPoint rendering.');
}
