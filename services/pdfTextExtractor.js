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
