import fs from 'fs';
import path from 'path';
import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

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
      // Default: try PDF (also handles no-extension S3 URLs)
      return await this._extractFromPdf(buffer, fileName);
    } catch (error) {
      console.error('[EXTRACTOR] Error extracting text:', error);
      throw error;
    }
  }

  async _extractFromPdf(buffer, fileName) {
    try {
      console.log('[EXTRACTOR] Extracting PDF:', fileName);
      const data = await pdfParse.default(buffer);
      if (!data.text.trim()) throw new Error('No text content found in PDF');
      return this.cleanExtractedText(data.text);
    } catch (error) {
      throw new Error('Failed to extract text from PDF: ' + error.message);
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
