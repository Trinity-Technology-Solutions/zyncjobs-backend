/**
 * Company Logo Service
 * Handles company logo URLs with fallback mechanisms
 */

/**
 * Get company logo URL with fallback options
 * @param {Object} company - Company object with name, domain, logo, website
 * @returns {Object} Logo information with URL and fallback data
 */
export const getCompanyLogo = (company) => {
  // If company has a custom logo URL, use it
  if (company.logo || company.logoUrl) {
    return {
      logoUrl: company.logo || company.logoUrl,
      fallbackType: 'custom',
      companyName: company.name
    };
  }

  // Try to get logo from domain using Google's favicon API
  const domain = company.domain || extractDomain(company.website);
  
  if (domain) {
    return {
      logoUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
      fallbackType: 'favicon',
      companyName: company.name,
      domain: domain
    };
  }

  // No logo available - frontend should show avatar with company initials
  return {
    logoUrl: null,
    fallbackType: 'avatar',
    companyName: company.name,
    initials: getCompanyInitials(company.name)
  };
};

/**
 * Extract domain from website URL
 * @param {string} website - Website URL
 * @returns {string|null} Domain name
 */
const extractDomain = (website) => {
  if (!website) return null;
  
  try {
    // Remove protocol if present
    let domain = website.replace(/^https?:\/\//, '');
    // Remove www. if present
    domain = domain.replace(/^www\./, '');
    // Remove path and query params
    domain = domain.split('/')[0];
    return domain;
  } catch (error) {
    return null;
  }
};

/**
 * Get company initials for avatar fallback
 * @param {string} companyName - Company name
 * @returns {string} Initials (max 2 characters)
 */
const getCompanyInitials = (companyName) => {
  if (!companyName) return '??';
  
  const words = companyName.trim().split(/\s+/);
  
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  
  return (words[0][0] + words[1][0]).toUpperCase();
};

/**
 * Format company data with logo information
 * @param {Object} company - Raw company data
 * @returns {Object} Formatted company with logo info
 */
export const formatCompanyWithLogo = (company) => {
  const logoInfo = getCompanyLogo(company);
  
  return {
    ...company,
    id: company.id?.toString(),
    domain: company.domain || extractDomain(company.website),
    logo: logoInfo.logoUrl,
    logoUrl: logoInfo.logoUrl,
    website: company.website || (company.domain ? `https://${company.domain}` : null),
    fallbackType: logoInfo.fallbackType,
    initials: logoInfo.initials
  };
};

export default {
  getCompanyLogo,
  formatCompanyWithLogo
};
