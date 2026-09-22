SELECT email, role, "verificationStatus", "isActive", status, "emailVerified", "failedLoginAttempts", "accountLockedUntil" 
FROM users 
WHERE email = 'muthees@trinitetech.com';

UPDATE users 
SET 
  "emailVerified" = true,
  "isActive" = true,
  status = 'active',
  "failedLoginAttempts" = 0,
  "accountLockedUntil" = NULL,
  role = 'employer',
  "verificationStatus" = 'verified'
WHERE email = 'muthees@trinitetech.com';

SELECT email, role, "verificationStatus", "isActive", status, "emailVerified", "failedLoginAttempts", "accountLockedUntil" 
FROM users 
WHERE email = 'muthees@trinitetech.com';
