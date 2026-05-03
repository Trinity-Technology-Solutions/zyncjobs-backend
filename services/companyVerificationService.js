/**
 * Company Verification Service - Backend
 * Handles company domain verification and profile validation
 */

import Company from '../models/Company.js';
import { Op } from 'sequelize';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load companies data
let companiesData = [];
try {
  companiesData = JSON.parse(readFileSync(join(__dirname, '../data/companies.json'), 'utf8'));
} catch (e) {
  console.warn('Could not load companies.json:', e.message);
  companiesData = [];
}

// Personal email domains that should require manual review
const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
  'rediffmail.com', 'ymail.com', 'live.com', 'aol.com',
  'protonmail.com', 'icloud.com', 'me.com'
];

// Corporate domain indicators
const CORPORATE_DOMAIN_TLDS = [
  '.com', '.co.in', '.in', '.org', '.net', '.co.uk', '.de', '.fr',
  '.co', '.io', '.tech', '.ai', '.biz', '.info'
];

class CompanyVerificationService {
  /**
   * Verify company domain and determine verification method
   */
  static async verifyCompanyDomain(email, companyName) {
    try {
      const domain = email.split('@')[1]?.toLowerCase();
      
      if (!domain) {
        return {
          isValid: false,
          isCompanyDomain: false,
          verificationMethod: 'manual_review',
          message: 'Invalid email format'
        };
      }

      // Check if it's a personal email domain
      if (PERSONAL_EMAIL_DOMAINS.includes(domain)) {
        return {
          isValid: true,
          isCompanyDomain: false,
          verificationMethod: 'manual_review',
          message: 'Personal email domain detected. Please use your company email address.'
        };
      }

      // Search for company in database first
      const companyProfile = await this.searchCompanyInDatabase(companyName, domain);
      
      if (companyProfile) {
        return {
          isValid: true,
          isCompanyDomain: true,
          companyProfile,
          verificationMethod: 'company_database',
          message: `Email domain matches ${companyProfile.name}. Your company is verified.`
        };
      }

      // Check if domain looks corporate
      const isDomainCorporate = this.checkDomainCorporate(domain);
      
      if (isDomainCorporate) {
        return {
          isValid: true,
          isCompanyDomain: true,
          verificationMethod: 'domain_check',
          message: `Corporate email domain detected (${domain}). Account will be verified after registration.`
        };
      }

      return {
        isValid: true,
        isCompanyDomain: false,
        verificationMethod: 'manual_review',
        message: 'Unable to verify domain automatically. Manual verification required.'
      };

    } catch (error) {
      console.error('Domain verification error:', error);
      return {
        isValid: false,
        isCompanyDomain: false,
        verificationMethod: 'manual_review',
        message: 'Verification service temporarily unavailable. Please try again.'
      };
    }
  }

  /**
   * Search for company in the database
   */
  static async searchCompanyInDatabase(companyName, domain) {
    try {
      // First check the database
      const dbCompany = await Company.findOne({
        where: {
          [Op.or]: [
            { name: { [Op.iLike]: companyName } },
            { domain: { [Op.iLike]: domain } }
          ]
        }
      });

      if (dbCompany) {
        return {
          id: dbCompany.id,
          name: dbCompany.name,
          domain: dbCompany.domain,
          logo: dbCompany.logoUrl || dbCompany.logo,
          website: dbCompany.website,
          industry: dbCompany.industry,
          size: dbCompany.size,
          verified: dbCompany.verified || false,
          gstNumber: dbCompany.gstNumber,
          registrationNumber: dbCompany.registrationNumber
        };
      }

      // Check the static companies data as fallback
      const staticCompany = companiesData.find(company => 
        (company.name?.toLowerCase() === companyName.toLowerCase()) ||
        (company.domain?.toLowerCase() === domain)
      );

      if (staticCompany) {
        return {
          id: staticCompany.id || `static_${staticCompany.name.replace(/\s+/g, '_').toLowerCase()}`,
          name: staticCompany.name,
          domain: staticCompany.domain,
          logo: staticCompany.logoUrl || staticCompany.logo,
          website: staticCompany.website,
          industry: staticCompany.industry,
          size: staticCompany.size,
          verified: true, // Static companies are considered verified
          gstNumber: staticCompany.gstNumber,
          registrationNumber: staticCompany.registrationNumber
        };
      }

      return null;
    } catch (error) {
      console.error('Company database search error:', error);
      return null;
    }
  }

  /**
   * Check if domain appears to be corporate
   */
  static checkDomainCorporate(domain) {
    // Basic heuristics for corporate domains
    const hasCorpTLD = CORPORATE_DOMAIN_TLDS.some(tld => domain.endsWith(tld));
    
    // Additional checks
    const isNotPersonal = !PERSONAL_EMAIL_DOMAINS.includes(domain);
    const hasReasonableLength = domain.length > 5 && domain.length < 50;
    const hasValidFormat = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain);
    
    return hasCorpTLD && isNotPersonal && hasReasonableLength && hasValidFormat;
  }

  /**
   * Get company suggestions based on partial name
   */
  static async getCompanySuggestions(partialName, limit = 10) {
    try {
      if (partialName.length < 2) return [];

      // Search database first
      const dbCompanies = await Company.findAll({
        where: {
          [Op.or]: [
            { name: { [Op.iLike]: `%${partialName}%` } },
            { domain: { [Op.iLike]: `%${partialName}%` } }
          ]
        },
        order: [['verified', 'DESC'], ['createdAt', 'DESC']],
        limit: Math.floor(limit / 2), // Reserve half for static companies
        attributes: { exclude: ['followers', 'verificationDocuments'] }
      });

      // Search static companies data
      const staticCompanies = companiesData
        .filter(company => 
          company.name?.toLowerCase().includes(partialName.toLowerCase()) ||
          company.domain?.toLowerCase().includes(partialName.toLowerCase())
        )
        .slice(0, Math.ceil(limit / 2))
        .map(company => ({
          id: company.id || `static_${company.name.replace(/\s+/g, '_').toLowerCase()}`,
          name: company.name,
          domain: company.domain,
          logo: company.logoUrl || company.logo,
          website: company.website,
          industry: company.industry,
          size: company.size,
          verified: true
        }));

      // Combine and deduplicate
      const allCompanies = [...dbCompanies.map(c => c.toJSON()), ...staticCompanies];
      const uniqueCompanies = allCompanies.filter((company, index, self) => 
        index === self.findIndex(c => c.name.toLowerCase() === company.name.toLowerCase())
      );

      return uniqueCompanies.slice(0, limit);

    } catch (error) {
      console.error('Company suggestions error:', error);
      return this.getFallbackSuggestions(partialName, limit);
    }
  }

  /**
   * Fallback company suggestions from static data
   */
  static getFallbackSuggestions(partialName, limit = 10) {
    return companiesData
      .filter(company => 
        company.name?.toLowerCase().includes(partialName.toLowerCase())
      )
      .slice(0, limit)
      .map(company => ({
        id: company.id || `static_${company.name.replace(/\s+/g, '_').toLowerCase()}`,
        name: company.name,
        domain: company.domain,
        logo: company.logoUrl || company.logo,
        website: company.website,
        industry: company.industry,
        size: company.size,
        verified: true
      }));
  }

  /**
   * Create or update company profile
   */
  static async createCompanyProfile(companyData) {
    try {
      const {
        name,
        domain,
        logo,
        website,
        industry,
        size,
        employerEmail,
        gstNumber,
        registrationNumber
      } = companyData;

      // Check if company already exists
      const existingCompany = await Company.findOne({
        where: {
          [Op.or]: [
            { name: { [Op.iLike]: name } },
            ...(domain ? [{ domain: { [Op.iLike]: domain } }] : [])
          ]
        }
      });

      if (existingCompany) {
        // Update existing company
        await existingCompany.update({
          logo: logo || existingCompany.logo,
          website: website || existingCompany.website,
          industry: industry || existingCompany.industry,
          size: size || existingCompany.size,
          gstNumber: gstNumber || existingCompany.gstNumber,
          registrationNumber: registrationNumber || existingCompany.registrationNumber
        });
        
        return existingCompany.toJSON();
      }

      // Create new company
      const newCompany = await Company.create({
        name,
        domain,
        logo,
        website,
        industry,
        size,
        gstNumber,
        registrationNumber,
        createdBy: employerEmail,
        verified: false,
        verificationStatus: 'pending'
      });

      return newCompany.toJSON();

    } catch (error) {
      console.error('Company profile creation error:', error);
      throw error;
    }
  }

  /**
   * Determine verification status based on verification result
   */
  static determineVerificationStatus(verificationResult) {
    if (!verificationResult) return 'pending';
    
    switch (verificationResult.verificationMethod) {
      case 'company_database':
        return 'verified'; // Company found in database
      case 'domain_check':
        return 'verified'; // Corporate domain detected
      case 'manual_review':
      default:
        return 'pending'; // Requires manual review
    }
  }

  /**
   * Get verification status message for backend
   */
  static getVerificationStatusMessage(status, method) {
    if (status === 'verified') {
      return method === 'company_database' 
        ? 'Company verified from database'
        : 'Corporate domain verified';
    }
    return 'Pending manual verification';
  }

  /**
   * Validate company registration data
   */
  static validateCompanyData(companyData) {
    const errors = [];
    const { name, domain, employerEmail } = companyData;

    if (!name || name.trim().length < 2) {
      errors.push('Company name must be at least 2 characters');
    }

    if (!employerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employerEmail)) {
      errors.push('Valid employer email is required');
    }

    if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      errors.push('Invalid domain format');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export { CompanyVerificationService };