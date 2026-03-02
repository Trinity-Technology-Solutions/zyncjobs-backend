import fs from 'fs';
import path from 'path';
import * as pdfParse from 'pdf-parse';

class PDFTextExtractor {
  async extractTextFromBuffer(buffer) {
    try {
      console.log('[PDF_EXTRACTOR] Extracting text from PDF buffer...');
      const data = await pdfParse.default(buffer);
      const extractedText = data.text;
      console.log('[PDF_EXTRACTOR] Extracted text length:', extractedText.length);
      
      if (!extractedText.trim()) {
        throw new Error('No text content found in PDF');
      }
      
      return this.cleanExtractedText(extractedText);
    } catch (error) {
      console.error('[PDF_EXTRACTOR] Error extracting text:', error);
      throw new Error('Failed to extract text from PDF: ' + error.message);
    }
  }

  async extractTextFromFile(filePath) {
    try {
      const buffer = fs.readFileSync(filePath);
      return await this.extractTextFromBuffer(buffer);
    } catch (error) {
      console.error('[PDF_EXTRACTOR] Error reading file:', error);
      throw new Error('Failed to read PDF file');
    }
  }

  cleanExtractedText(text) {
    // Clean up extracted text
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }


}

export default new PDFTextExtractor();