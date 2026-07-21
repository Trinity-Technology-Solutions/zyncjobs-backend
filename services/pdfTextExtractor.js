import fs from 'fs';
import path from 'path';
import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';

let pdfjsLib = null;
try {
  pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => null)
    || await import('pdfjs-dist/build/pdf.mjs').catch(() => null);
} catch {}
console.log('[EXTRACTOR] pdfjs-dist:', pdfjsLib ? 'loaded' : 'not available, using pdf-parse fallback');

class PDFTextExtractor {
  // fileName is optional — used to detect file type when buffer has no header
  async extractTextFromBuffer(buffer, fileName = '') {
    const ext = path.extname(fileName).toLowerCase();

    try {
      if (ext === '.docx' || ext === '.doc') {
        return await this._extractFromDocx(buffer, fileName);
      }
      if (ext === '.txt') {
        return this.cleanExtractedText(buffer.toString('utf-8'));
      }
      if (['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'].includes(ext)) {
        return await this._extractFromImage(buffer, fileName);
      }
      // Default: try PDF (also handles no-extension S3 URLs)
      return await this._extractFromPdf(buffer, fileName);
    } catch (error) {
      console.error('[EXTRACTOR] Error extracting text:', error);
      throw error;
    }
  }

  async _extractFromPdf(buffer, fileName) {
    // Try pdfjs-dist first (handles multi-column layouts correctly)
    if (pdfjsLib) {
      try {
        console.log('[EXTRACTOR] Extracting PDF with pdfjs:', fileName);
        const uint8Array = new Uint8Array(buffer);
        const loadingTask = pdfjsLib.getDocument({ data: uint8Array, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true });
        const pdf = await loadingTask.promise;
        let fullText = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const viewport = page.getViewport({ scale: 1 });

          const items = textContent.items
            .filter(item => item.str && item.str.trim())
            .map(item => ({
              str: item.str,
              x: item.transform[4],
              y: viewport.height - item.transform[5]
            }))
            .sort((a, b) => {
              const yDiff = Math.round(a.y / 5) - Math.round(b.y / 5);
              return yDiff !== 0 ? yDiff : a.x - b.x;
            });

          const lines = [];
          let currentLine = [];
          let lastY = null;
          for (const item of items) {
            const rowY = Math.round(item.y / 5);
            if (lastY === null || rowY === lastY) {
              currentLine.push(item.str);
            } else {
              if (currentLine.length) lines.push(currentLine.join(' '));
              currentLine = [item.str];
            }
            lastY = rowY;
          }
          if (currentLine.length) lines.push(currentLine.join(' '));
          fullText += lines.join('\n') + '\n';
        }

        if (!fullText.trim()) throw new Error('No text content found in PDF');
        console.log('[EXTRACTOR] pdfjs extracted, length:', fullText.length);
        return this.cleanExtractedText(fullText);
      } catch (pdfjsError) {
        console.warn('[EXTRACTOR] pdfjs failed, falling back to pdf-parse:', pdfjsError.message);
      }
    }
    // Fallback to pdf-parse
    try {
      console.log('[EXTRACTOR] Extracting PDF with pdf-parse:', fileName);
      const data = await pdfParse.default(buffer);
      if (!data.text.trim()) throw new Error('No text content found in PDF');
      return this.cleanExtractedText(data.text);
    } catch (error) {
      // Last resort: OCR the PDF pages as images
      console.warn('[EXTRACTOR] pdf-parse failed, trying OCR:', error.message);
      return await this._ocrPdf(buffer, fileName);
    }
  }

  async _ocrPdf(buffer, fileName) {
    // Convert PDF to image via sharp isn't possible directly — use tesseract on the raw buffer
    // as a best-effort for scanned PDFs (tesseract can sometimes handle PDF bytes)
    console.log('[EXTRACTOR] Attempting OCR on scanned PDF:', fileName);
    const worker = await createWorker('eng');
    try {
      const { data: { text } } = await worker.recognize(buffer);
      if (!text?.trim()) throw new Error('OCR returned no text from PDF');
      console.log('[EXTRACTOR] PDF OCR extracted, length:', text.length);
      return this.cleanExtractedText(text);
    } finally {
      await worker.terminate();
    }
  }

  async _extractFromImage(buffer, fileName) {
    console.log('[EXTRACTOR] Running OCR on image:', fileName);
    const worker = await createWorker('eng');
    try {
      const { data: { text } } = await worker.recognize(buffer);
      if (!text?.trim()) throw new Error('OCR returned no text');
      console.log('[EXTRACTOR] OCR extracted, length:', text.length);
      return this.cleanExtractedText(text);
    } finally {
      await worker.terminate();
    }
  }

  async _extractFromDocx(buffer, fileName) {
    try {
      console.log('[EXTRACTOR] Extracting DOCX/DOC:', fileName);
      const ext = path.extname(fileName).toLowerCase();

      // Old .doc binary format — mammoth can't handle it, extract raw text from buffer
      if (ext === '.doc') {
        const raw = buffer.toString('latin1');
        // Extract readable ASCII text from binary .doc
        const text = raw
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF]/g, ' ')
          .replace(/\s{3,}/g, '\n')
          .trim();
        if (!text || text.length < 20) throw new Error('Could not extract readable text from .doc file');
        return this.cleanExtractedText(text);
      }

      // .docx — use mammoth
      const result = await mammoth.extractRawText({ buffer });
      if (!result.value.trim()) throw new Error('No text content found in DOCX');
      return this.cleanExtractedText(result.value);
    } catch (error) {
      throw new Error('Failed to extract text from DOCX: ' + error.message);
    }
  }

  async extractTextFromFile(filePath) {
    try {
      const buffer = fs.readFileSync(filePath);
      return await this.extractTextFromBuffer(buffer, path.basename(filePath));
    } catch (error) {
      console.error('[EXTRACTOR] Error reading file:', error);
      throw new Error('Failed to read file: ' + error.message);
    }
  }

  cleanExtractedText(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

export default new PDFTextExtractor();
