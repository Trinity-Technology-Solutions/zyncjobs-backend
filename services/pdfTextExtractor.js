import fs from 'fs';
import path from 'path';
import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

let pdfjsLib = null;
try {
  pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => null)
    || await import('pdfjs-dist/build/pdf.mjs').catch(() => null);
} catch {}
console.log('[EXTRACTOR] pdfjs-dist:', pdfjsLib ? 'loaded' : 'not available, using pdf-parse fallback');

const execAsync = promisify(exec);

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
        let totalChars = 0;
        const pageCount = pdf.numPages;
        console.log(`[EXTRACTOR] PDF has ${pageCount} pages`);

        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
          try {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1 });
            const lines = await this._extractLinesFromPage(page, viewport);
            const pageText = this._reorderLinesByColumns(lines, viewport);
            console.log(`[EXTRACTOR] Page ${pageNum}/${pageCount}: ${pageText.length} chars`);
            totalChars += pageText.length;
            fullText += pageText + '\n';
          } catch (pageError) {
            console.warn(`[EXTRACTOR] Failed to extract page ${pageNum}:`, pageError.message);
          }
        }

        if (!fullText.trim() || totalChars < 100) {
          throw new Error(`Insufficient text extracted (${totalChars} chars) — likely scanned/image-based PDF`);
        }
        console.log('[EXTRACTOR] pdfjs extracted total:', totalChars, 'chars from', pageCount, 'pages');
        return this.cleanExtractedText(fullText);
      } catch (pdfjsError) {
        console.warn('[EXTRACTOR] pdfjs failed, falling back to pdf-parse:', pdfjsError.message);
      }
    }
    // Fallback to pdf-parse
    try {
      console.log('[EXTRACTOR] Extracting PDF with pdf-parse:', fileName);
      const data = await pdfParse.default(buffer);
      if (!data.text.trim() || data.text.length < 100) throw new Error('Insufficient text from pdf-parse');
      return this.cleanExtractedText(data.text);
    } catch (error) {
      // Last resort: OCR the PDF pages as images
      console.warn('[EXTRACTOR] pdf-parse failed, trying OCR:', error.message);
      return await this._ocrPdf(buffer, fileName);
    }
  }

  // Layout-aware line extraction: reads each item's (x, y) from the PDF
  // transform and groups text runs into visual lines using position, not
  // raw text order. This is what lets us detect two-column layouts.
  async _extractLinesFromPage(page, viewport) {
    const textContent = await page.getTextContent();
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

    const rawLines = [];
    let current = null;
    for (const item of items) {
      const rowY = Math.round(item.y / 5);
      if (current && rowY === current.y) {
        current.texts.push(item.str);
        current.xMin = Math.min(current.xMin, item.x);
        current.xMax = Math.max(current.xMax, item.x);
      } else {
        if (current) rawLines.push(current);
        current = { y: rowY, texts: [item.str], xMin: item.x, xMax: item.x };
      }
    }
    if (current) rawLines.push(current);

    return rawLines.map(l => ({
      text: l.texts.join(' '),
      y: l.y,
      xMin: l.xMin,
      xMax: l.xMax,
      xMid: (l.xMin + l.xMax) / 2
    }));
  }

  // Column detection: finds the widest horizontal gap between line
  // midpoints. If both sides are substantial, the page is treated as
  // two-column and read left column top->bottom, then right column.
  // Full-width lines (headers/footers) are placed around the columns by
  // their vertical position. Falls back to plain top->bottom otherwise.
  _reorderLinesByColumns(lines, viewport) {
    if (lines.length < 4) {
      return lines.map(l => l.text).join('\n');
    }

    const mids = lines.map(l => l.xMid).sort((a, b) => a - b);
    let bestGap = -1;
    let splitAt = null;
    for (let i = 1; i < mids.length; i++) {
      const gap = mids[i] - mids[i - 1];
      if (gap > bestGap) {
        bestGap = gap;
        splitAt = (mids[i] + mids[i - 1]) / 2;
      }
    }

    const pageWidth = viewport.width || 595;
    if (bestGap < pageWidth * 0.08 || splitAt === null) {
      return lines.sort((a, b) => a.y - b.y).map(l => l.text).join('\n');
    }

    const left = [];
    const right = [];
    const full = [];
    for (const l of lines) {
      const span = l.xMax - l.xMin;
      if (span > pageWidth * 0.6) full.push(l);
      else if (l.xMid < splitAt) left.push(l);
      else right.push(l);
    }

    if (left.length < 3 || right.length < 3) {
      return lines.sort((a, b) => a.y - b.y).map(l => l.text).join('\n');
    }

    const byY = arr => arr.sort((a, b) => a.y - b.y);
    const pageHeight = viewport.height || 842;
    const topFull = byY(full.filter(l => l.y < pageHeight / 2)).map(l => l.text);
    const bottomFull = byY(full.filter(l => l.y >= pageHeight / 2)).map(l => l.text);

    return [...topFull, ...byY(left).map(l => l.text), ...byY(right).map(l => l.text), ...bottomFull].join('\n');
  }

  // OCR PDF using pdf2image (poppler) + tesseract - works for multi-page PDFs
  async _ocrPdf(buffer, fileName) {
    console.log('[EXTRACTOR] Attempting OCR on scanned PDF using pdf2image:', fileName);
    
    // Check if pdftoppm (poppler) is available
    const hasPoppler = await this._checkCommand('pdftoppm');
    if (!hasPoppler) {
      console.warn('[EXTRACTOR] pdftoppm not available, falling back to single-page tesseract');
      return await this._ocrPdfSinglePage(buffer, fileName);
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-ocr-'));
    const pdfPath = path.join(tempDir, 'input.pdf');
    const imagePrefix = path.join(tempDir, 'page');
    
    try {
      // Write PDF buffer to temp file
      fs.writeFileSync(pdfPath, buffer);
      
      // Convert PDF to images using pdftoppm (poppler-utils)
      // -png for PNG output, -r 300 for 300 DPI quality
      console.log('[EXTRACTOR] Converting PDF to images with pdftoppm...');
      const { stdout, stderr } = await execAsync(`pdftoppm -png -r 300 "${pdfPath}" "${imagePrefix}"`, {
        timeout: 120000, // 2 min timeout
        maxBuffer: 1024 * 1024 * 50 // 50MB buffer
      });
      
      if (stderr) console.warn('[EXTRACTOR] pdftoppm stderr:', stderr);
      
      // Find generated image files
      const imageFiles = fs.readdirSync(tempDir)
        .filter(f => f.startsWith('page-') && f.endsWith('.png'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/page-(\d+)\.png/)?.[1] || '0', 10);
          const numB = parseInt(b.match(/page-(\d+)\.png/)?.[1] || '0', 10);
          return numA - numB;
        });
      
      console.log(`[EXTRACTOR] Generated ${imageFiles.length} page images for OCR`);
      
      if (imageFiles.length === 0) {
        throw new Error('No pages generated from PDF');
      }
      
      // OCR each page with tesseract.js
      const worker = await createWorker('eng');
      let fullText = '';
      
      try {
        for (let i = 0; i < imageFiles.length; i++) {
          const imagePath = path.join(tempDir, imageFiles[i]);
          console.log(`[EXTRACTOR] OCR page ${i + 1}/${imageFiles.length}: ${imageFiles[i]}`);
          
          try {
            const { data: { text } } = await worker.recognize(imagePath);
            if (text?.trim()) {
              fullText += text + '\n';
            }
          } catch (pageError) {
            console.warn(`[EXTRACTOR] Failed to OCR page ${i + 1}:`, pageError.message);
          }
        }
        
        if (!fullText.trim()) throw new Error('OCR returned no text from any page');
        
        console.log('[EXTRACTOR] PDF OCR extracted (multi-page):', fullText.length, 'chars');
        return this.cleanExtractedText(fullText);
      } finally {
        await worker.terminate();
      }
    } catch (error) {
      console.warn('[EXTRACTOR] Multi-page OCR failed, trying single-page fallback:', error.message);
      return await this._ocrPdfSinglePage(buffer, fileName);
    } finally {
      // Cleanup temp files
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (_) {}
    }
  }

  // Fallback: Single-page OCR using tesseract.js directly on PDF buffer
  // Only works for single-page PDFs, but better than nothing
  async _ocrPdfSinglePage(buffer, fileName) {
    console.log('[EXTRACTOR] Attempting single-page OCR fallback:', fileName);
    const worker = await createWorker('eng');
    try {
      // Add timeout wrapper
      const recognizePromise = worker.recognize(buffer);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OCR timeout after 60s')), 60000)
      );
      
      const { data: { text } } = await Promise.race([recognizePromise, timeoutPromise]);
      if (!text?.trim()) throw new Error('OCR returned no text from PDF');
      console.log('[EXTRACTOR] Single-page PDF OCR extracted:', text.length, 'chars');
      return this.cleanExtractedText(text);
    } catch (error) {
      console.error('[EXTRACTOR] Single-page OCR failed:', error.message);
      throw new Error(`PDF OCR failed: ${error.message}`);
    } finally {
      await worker.terminate();
    }
  }

  async _extractFromImage(buffer, fileName) {
    console.log('[EXTRACTOR] Running OCR on image:', fileName);
    const worker = await createWorker('eng');
    try {
      // Add timeout wrapper for image OCR too
      const recognizePromise = worker.recognize(buffer);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OCR timeout after 60s')), 60000)
      );
      
      const { data: { text } } = await Promise.race([recognizePromise, timeoutPromise]);
      if (!text?.trim()) throw new Error('OCR returned no text');
      console.log('[EXTRACTOR] OCR extracted, length:', text.length);
      return this.cleanExtractedText(text);
    } catch (error) {
      console.error('[EXTRACTOR] Image OCR failed:', error.message);
      throw new Error(`Image OCR failed: ${error.message}`);
    } finally {
      await worker.terminate();
    }
  }

  // Check if a command is available in PATH
  async _checkCommand(cmd) {
    try {
      await execAsync(`which ${cmd}`);
      return true;
    } catch {
      return false;
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
