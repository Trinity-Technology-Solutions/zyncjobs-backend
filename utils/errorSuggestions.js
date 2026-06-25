const errorSuggestions = {
  email: [
    { match: 'valid email', suggestion: 'Enter a valid email in the format example@domain.com' },
    { match: 'already exists', suggestion: 'Try logging in or use a different email address' },
    { match: 'required', suggestion: 'Email is required to create an account' },
  ],
  password: [
    { match: 'at least', suggestion: 'Use at least 8 characters with uppercase, number, and special character' },
    { match: 'required', suggestion: 'Password is required' },
    { match: 'mismatch', suggestion: 'Passwords do not match. Enter the same password in both fields' },
  ],
  name: [
    { match: 'required', suggestion: 'Enter your full name' },
    { match: 'length', suggestion: 'Name must be between 2 and 50 characters' },
  ],
  fullName: [
    { match: 'required', suggestion: 'Enter your full name' },
    { match: 'length', suggestion: 'Name must be between 2 and 50 characters' },
  ],
  phone: [
    { match: 'required', suggestion: 'Enter a phone number for verification' },
    { match: 'invalid', suggestion: 'Enter a valid 10-digit mobile number without spaces or special characters' },
  ],
  company: [
    { match: 'required', suggestion: 'Enter your company name' },
  ],
  companyName: [
    { match: 'required', suggestion: 'Enter your company name' },
  ],
  userType: [
    { match: 'required', suggestion: 'Select whether you are an employer or job seeker' },
  ],
  gstNumber: [
    { match: 'required', suggestion: 'Enter your GST number for verification' },
    { match: 'invalid', suggestion: 'Enter a valid 15-digit GST number' },
  ],
  domainVerification: [
    { match: 'required', suggestion: 'Provide domain verification details' },
  ],
};

function getSuggestion(field, message) {
  const fieldSuggestions = errorSuggestions[field] || [];
  const lowerMsg = message.toLowerCase();
  
  for (const { match, suggestion } of fieldSuggestions) {
    if (lowerMsg.includes(match.toLowerCase())) {
      return suggestion;
    }
  }
  
  return null;
}

export function enhanceValidationErrors(errors) {
  return errors.array().map(err => ({
    field: err.path,
    message: err.msg,
    suggestion: getSuggestion(err.path, err.msg),
  }));
}

export function enhanceError(message, statusCode, field = null) {
  const error = { success: false, error: message };
  
  if (field) {
    error.field = field;
    error.suggestion = getSuggestion(field, message);
  }
  
  if (statusCode === 400) {
    if (!error.suggestion && message.toLowerCase().includes('invalid')) {
      error.suggestion = 'Check your input and try again';
    }
  } else if (statusCode === 401) {
    error.suggestion = 'Check your credentials and try again, or request a password reset';
  } else if (statusCode === 403) {
    error.suggestion = 'You do not have permission to access this resource. Contact admin if needed';
  } else if (statusCode === 404) {
    error.suggestion = 'The requested resource was not found. Check the URL and try again';
  } else if (statusCode === 413) {
    error.suggestion = 'Upload a smaller file (max 5 MB)';
  } else if (statusCode === 422) {
    error.suggestion = 'The data provided is invalid. Check all required fields';
  } else if (statusCode === 429) {
    error.suggestion = 'Too many requests. Wait a moment and try again';
  } else if (statusCode >= 500) {
    error.suggestion = 'Something went wrong on our end. Please try again later or contact support';
  }
  
  return error;
}