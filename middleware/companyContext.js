import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import TeamMember from '../models/TeamMember.js';
import { Op } from 'sequelize';

// Middleware to set company context for dashboard and other company-wide operations
export const setCompanyContext = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if user is a team member
    const teamMember = await TeamMember.findOne({
      where: { memberEmail: { [Op.iLike]: user.email }, status: 'active' }
    });

    let companyEmail;
    let isTeamMember = false;
    let role = 'Owner';

    if (teamMember) {
      // User is a team member - use the employer's email as company identifier
      companyEmail = teamMember.employerId;
      isTeamMember = true;
      role = teamMember.role;
    } else {
      // User is the main employer - use their email as company identifier
      companyEmail = user.email;
    }

    // Add company context to request
    req.companyContext = {
      employerEmail: companyEmail,
      isTeamMember,
      role,
      currentUser: user
    };

    // Override query parameters to ensure consistent company data
    req.query.employerEmail = companyEmail;
    
    next();
    
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};