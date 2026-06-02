const { body, param, validationResult, query } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorArray = errors.array();
    return res.status(400).json({ 
      error: errorArray[0].msg, 
      errors: errorArray 
    });
  }
  next();
};

// Auth validation
const validateRegister = [
  body('name').trim().isLength({ min: 2 }).escape().withMessage('Name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 0,
    minNumbers: 1,
    minSymbols: 1,
    symbols: '@-_.'
  }).withMessage('Password: 8+ chars, 1 letter, 1 number, 1 (@-_. )'),
  body('role').optional().isIn(['agent', 'admin', 'quality']),
  handleValidationErrors
];

const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  handleValidationErrors
];

const validatePasswordReset = [
  body('email').isEmail().normalizeEmail(),
  body('code').isLength({ min: 6, max: 6 }).isNumeric(),
  body('newPassword').custom((value, { req }) => {
    if (value === req.body.oldPassword) {
      throw new Error('New password must differ from old');
    }
    return true;
  }),
  handleValidationErrors
];

// Agent endpoints
const validatePrecallComplete = [
  body('surveyId').optional().isMongoId(),
  body('payload').notEmpty().isObject(),
  body('interviewStartedAt').isISO8601(),
  handleValidationErrors
];

const validateResponseSubmit = [
  body('surveyId').isMongoId().withMessage('Valid survey ID required'),
  body('interviewOutcome').isIn(['completed', 'partial', 'postponed', 'refused', 'no_qualified', 'not_contacted']),
  body('answers').isArray().withMessage('Answers must be an array'),
  handleValidationErrors
];

// Survey endpoints
const validateSurveyId = [
  param('id').isMongoId(),
  handleValidationErrors
];

module.exports = {
  validateRegister,
  validateLogin,
  validatePasswordReset,
  validatePrecallComplete,
  validateResponseSubmit,
  validateSurveyId
};

