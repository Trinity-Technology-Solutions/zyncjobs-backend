/**
 * Company Logo Service
 * Handles company logo URLs with fallback mechanisms
 */

/**
 * Get company logo URL with fallback options
 * @param {Object} company - Company object with name, domain, logo, website
 * @returns {Object} Logo information with URL and fallback data
 */
const isFaviconUrl = (url) => url && url.includes('google.com/s2/favicons');

export const getCompanyLogo = (company) => {
  // If company has a custom logo URL (not a stale favicon), use it
  const storedLogo = company.logo || company.logoUrl;
  if (storedLogo && !isFaviconUrl(storedLogo)) {
    return {
      logoUrl: storedLogo,
      fallbackType: 'custom',
      companyName: company.name
    };
  }

  // Try to get logo from well-known company URLs first
  const knownLogo = getKnownCompanyLogo(company.name);
  if (knownLogo) {
    return {
      logoUrl: knownLogo.url,
      fallbackType: 'known_logo',
      companyName: company.name,
      domain: knownLogo.domain
    };
  }

  // Try to get logo from domain using multiple fallback services
  const domain = company.domain || extractDomain(company.website);
  
  if (domain) {
    return {
      logoUrl: `https://logo.clearbit.com/${domain}`,
      fallbackType: 'clearbit',
      companyName: company.name,
      domain: domain,
      alternativeLogos: [
        `https://img.logo.dev/${domain}?token=pk_cY8JBeWnQR6g5m_ymQhBoQ&size=80`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
      ]
    };
  }

  // Try to get logo from well-known company domains
  const knownDomain = getKnownCompanyDomain(company.name);
  if (knownDomain) {
    return {
      logoUrl: `https://logo.clearbit.com/${knownDomain}`,
      fallbackType: 'known_domain',
      companyName: company.name,
      domain: knownDomain,
      alternativeLogos: [
        `https://img.logo.dev/${knownDomain}?token=pk_cY8JBeWnQR6g5m_ymQhBoQ&size=80`,
        `https://www.google.com/s2/favicons?domain=${knownDomain}&sz=128`
      ]
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
 * Get known company logo URLs for major companies
 * @param {string} companyName - Company name
 * @returns {Object|null} Logo URL and domain
 */
const getKnownCompanyLogo = (companyName) => {
  const knownLogos = {
    'Infosys': {
      url: 'https://logo.clearbit.com/infosys.com',
      domain: 'infosys.com'
    },
    'Zoho': {
      url: 'https://logo.clearbit.com/zoho.com',
      domain: 'zoho.com'
    },
    'zoho': {
      url: 'https://logo.clearbit.com/zoho.com',
      domain: 'zoho.com'
    },
    'Google': {
      url: 'https://logo.clearbit.com/google.com',
      domain: 'google.com'
    },
    'Microsoft': {
      url: 'https://logo.clearbit.com/microsoft.com',
      domain: 'microsoft.com'
    },
    'Apple': {
      url: 'https://logo.clearbit.com/apple.com',
      domain: 'apple.com'
    },
    'Amazon': {
      url: 'https://logo.clearbit.com/amazon.com',
      domain: 'amazon.com'
    },
    'TCS': {
      url: 'https://logo.clearbit.com/tcs.com',
      domain: 'tcs.com'
    },
    'Wipro': {
      url: 'https://logo.clearbit.com/wipro.com',
      domain: 'wipro.com'
    },
    'Trinity Technology Solutions': {
      url: '/images/trinity-logo.webp',
      domain: 'trinitetech.com'
    },
    'Nambikkai India': {
      url: 'https://logo.clearbit.com/nambikkaiindia.org',
      domain: 'nambikkaiindia.org'
    }
  };
  
  return knownLogos[companyName] || null;
};

/**
 * Get known company domain for well-known companies
 * @param {string} companyName - Company name
 * @returns {string|null} Known domain
 */
const getKnownCompanyDomain = (companyName) => {
  const knownCompanies = {
    'Google': 'google.com',
    'Microsoft': 'microsoft.com',
    'Apple': 'apple.com',
    'Amazon': 'amazon.com',
    'Meta': 'meta.com',
    'Facebook': 'facebook.com',
    'Netflix': 'netflix.com',
    'Spotify': 'spotify.com',
    'Uber': 'uber.com',
    'Airbnb': 'airbnb.com',
    'Tesla': 'tesla.com',
    'Twitter': 'twitter.com',
    'LinkedIn': 'linkedin.com',
    'Instagram': 'instagram.com',
    'YouTube': 'youtube.com',
    'TikTok': 'tiktok.com',
    'Snapchat': 'snapchat.com',
    'WhatsApp': 'whatsapp.com',
    'Telegram': 'telegram.org',
    'Discord': 'discord.com',
    'Slack': 'slack.com',
    'Zoom': 'zoom.us',
    'Dropbox': 'dropbox.com',
    'Adobe': 'adobe.com',
    'Salesforce': 'salesforce.com',
    'Oracle': 'oracle.com',
    'IBM': 'ibm.com',
    'Intel': 'intel.com',
    'NVIDIA': 'nvidia.com',
    'AMD': 'amd.com',
    'Samsung': 'samsung.com',
    'Sony': 'sony.com',
    'LG': 'lg.com',
    'HP': 'hp.com',
    'Dell': 'dell.com',
    'Lenovo': 'lenovo.com',
    'Asus': 'asus.com',
    'Acer': 'acer.com',
    'Huawei': 'huawei.com',
    'Xiaomi': 'mi.com',
    'OnePlus': 'oneplus.com',
    'Oppo': 'oppo.com',
    'Vivo': 'vivo.com',
    'Realme': 'realme.com',
    // Indian companies
    'Infosys': 'infosys.com',
    'TCS': 'tcs.com',
    'Wipro': 'wipro.com',
    'HCL': 'hcltech.com',
    'Tech Mahindra': 'techmahindra.com',
    'Cognizant': 'cognizant.com',
    'Accenture': 'accenture.com',
    'Capgemini': 'capgemini.com',
    'Deloitte': 'deloitte.com',
    'EY': 'ey.com',
    'PwC': 'pwc.com',
    'KPMG': 'kpmg.com',
    'Flipkart': 'flipkart.com',
    'Paytm': 'paytm.com',
    'Zomato': 'zomato.com',
    'Swiggy': 'swiggy.com',
    'Ola': 'olacabs.com',
    'Byju\'s': 'byjus.com',
    'Unacademy': 'unacademy.com',
    'PhonePe': 'phonepe.com',
    'Razorpay': 'razorpay.com',
    'Freshworks': 'freshworks.com',
    'Zoho': 'zoho.com',
    'zoho': 'zoho.com'
  };
  
  return knownCompanies[companyName] || null;
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
    initials: logoInfo.initials,
    // Add fallback logo URLs for frontend to handle errors
    fallbackLogoUrl: logoInfo.domain ? `https://www.google.com/s2/favicons?domain=${logoInfo.domain}&sz=128` : null,
    alternativeLogos: logoInfo.alternativeLogos || []
  };
};

export default {
  getCompanyLogo,
  formatCompanyWithLogo
};
